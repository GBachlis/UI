#include <stdio.h>
#include <stdlib.h>
#include <unistd.h>
#include <signal.h>
#include <errno.h>
#include <sys/epoll.h>
#include <sys/timerfd.h>
#include <sys/socket.h>

#include "common_ws.h"       // Provides BUFFER_SIZE, sensor_data_t, globals, g_clients_mutex
#include "remote_ws.h"       // Remote data source
#include "frontend_ws.h"     // Frontend server & client handler
#include "config.h"
#include "video_ws.h"
#include "rtsp2ws_video.h"
#define _POSIX_C_SOURCE 200809L
#include <inttypes.h>  // for PRIu64
#include <time.h>

volatile sig_atomic_t running = 1;

pthread_t video_server_thread;

#define REMOTE_PING_TIMEOUT_SEC 3
#define REMOTE_STALL_TIMEOUT_SEC 5

static time_t monotonic_now_sec(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return ts.tv_sec;
}

static int remote_socket_is_dead(int fd) {
    char tmp;
    ssize_t n;

    if (fd < 0) {
        return 1;
    }

    n = recv(fd, &tmp, 1, MSG_PEEK | MSG_DONTWAIT);
    if (n == 0) {
        return 1;
    }

    if (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
        return 1;
    }

    return 0;
}

static int connect_remote_with_fallback(char **connected_ip) {
    while (running) {
        g_remote_fd = connect_remote_ws(REMOTE_WS_IP, REMOTE_WS_PORT);
        if (g_remote_fd >= 0) {
            *connected_ip = REMOTE_WS_IP;
            printf("Connected to remote WebSocket server at %s:%d\n", *connected_ip, REMOTE_WS_PORT);
            return 0;
        }

        fprintf(stderr, "Failed to connect to remote WebSocket server. Trying secondary server...\n");

        g_remote_fd = connect_remote_ws(REMOTE_WS_SECONDARY_IP, REMOTE_WS_PORT);
        if (g_remote_fd >= 0) {
            *connected_ip = REMOTE_WS_SECONDARY_IP;
            printf("Connected to secondary remote WebSocket server at %s:%d\n", *connected_ip, REMOTE_WS_PORT);
            return 0;
        }

        fprintf(stderr, "Failed to connect to secondary WebSocket server. Retrying...\n");
        sleep(1);
    }

    return -1;
}

void *video_server_thread_func(void *arg) {
    (void)arg;
    video_epoll_loop();
    return NULL;
}

// Handle SIGINT to exit cleanly
void handle_sigint_wrapper(int sig) {
    (void)sig;
    running = 0;
}

// Clean up sockets and other resources
void cleanup(void) {
    uint8_t close_buf[BUFFER_SIZE];
    size_t close_size = sizeof(close_buf);
    ws_create_closing_frame(close_buf, &close_size);

    // Stop RTSP video thread
    rtsp_video_stop();

    // Lock client list while shutting down connections
    pthread_mutex_lock(&g_clients_mutex);
    for (int i = 0; i < MAX_CLIENTS; i++) {
        if (g_clients[i].fd != -1) {
            send(g_clients[i].fd, close_buf, close_size, 0);
            close(g_clients[i].fd);
            g_clients[i].fd = -1;
            g_clients[i].handshake_done = false;
            g_clients[i].buffer_len = 0;
        }
    }
    pthread_mutex_unlock(&g_clients_mutex);

    if (g_server_fd != -1)
        close(g_server_fd);
    if (g_remote_fd != -1)
        close(g_remote_fd);
}

int main(void) {

    if (initialize_csv_logging() < 0) {
        fprintf(stderr, "Failed to initialize CSV logging.\n");
        cleanup();
        return EXIT_FAILURE;
    }
    
    signal(SIGINT, handle_sigint);

    // Initialize frontend client slots
    pthread_mutex_lock(&g_clients_mutex);
    for (int i = 0; i < MAX_CLIENTS; i++) {
        g_clients[i].fd = -1;
        g_clients[i].handshake_done = false;
        g_clients[i].buffer_len = 0;
    }
    pthread_mutex_unlock(&g_clients_mutex);

    // Start frontend WebSocket server
    g_server_fd = init_frontend_server(FRONTEND_PORT);
    if (g_server_fd < 0) {
        fprintf(stderr, "Failed to initialize frontend server\n");
        return EXIT_FAILURE;
    }
    printf("Frontend WebSocket server listening on port %d\n", FRONTEND_PORT);
    
    char* connected_ip = REMOTE_WS_IP;
    time_t last_remote_activity = monotonic_now_sec();

    // Connect to remote data source
    if (connect_remote_with_fallback(&connected_ip) < 0) {
        cleanup();
        return EXIT_SUCCESS;
    }

    if (!running) {
        cleanup();
        return EXIT_SUCCESS;
    }
    last_remote_activity = monotonic_now_sec();

    // Set up epoll
    epoll_fd = epoll_create1(0);
    if (epoll_fd < 0) {
        perror("epoll_create1()");
        cleanup();
        return EXIT_FAILURE;
    }

    struct epoll_event ev;
    ev.events = EPOLLIN;
    ev.data.fd = g_server_fd;
    if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, g_server_fd, &ev) < 0) {
        perror("epoll_ctl(): server_fd");
        cleanup();
        return EXIT_FAILURE;
    }

    ev.events = EPOLLIN | EPOLLET | EPOLLRDHUP;
    ev.data.fd = g_remote_fd;
    if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, g_remote_fd, &ev) < 0) {
        perror("epoll_ctl(): remote_fd");
        cleanup();
        return EXIT_FAILURE;
    }

    struct epoll_event timer_ev;
    int timer_fd = timerfd_create(CLOCK_MONOTONIC, TFD_NONBLOCK);
    if (timer_fd < 0) {
        perror("timerfd_create()");
        cleanup();
        return EXIT_FAILURE;
    }

    struct itimerspec timer_spec = {
        .it_interval = {1, 0}, // 1 second interval
        .it_value = {1, 0}     // Initial expiration after 1 second
    };
    if (timerfd_settime(timer_fd, 0, &timer_spec, NULL) < 0) {
        perror("timerfd_settime()");
        cleanup();
        return EXIT_FAILURE;
    }

    timer_ev.events = EPOLLIN;
    timer_ev.data.fd = timer_fd;
    if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, timer_fd, &timer_ev) < 0) {
        perror("epoll_ctl(): timer_fd");
        cleanup();
        return EXIT_FAILURE;
    }

    // Main epoll loop
    struct epoll_event events[1024];
    while (running) {
        int nready = epoll_wait(epoll_fd, events, 1024, 100);
        if (nready < 0) {
            if (errno == EINTR)
                continue;
            perror("epoll_wait()");
            break;
        }
        for (int i = 0; i < nready; i++) {
            int fd = events[i].data.fd;
            // printf("MAIN:FD %d ->", fd);
            if (fd == g_server_fd) {
                printf("FE:FD %d ->", fd);
                printf("New frontend connection incoming\n");
                handle_new_client();  // Assumes it uses mutex internally
            } else if (fd == g_remote_fd) {
                // printf("DR:FD %d ->", fd);
                // printf("Data from remote incoming\n")
                //fprintf(stderr, "Data from remote WebSocket incoming\n");

                if ((events[i].events & (EPOLLERR | EPOLLHUP | EPOLLRDHUP)) || remote_socket_is_dead(g_remote_fd)) {
                    fprintf(stderr, "Remote WebSocket disconnected. Reconnecting...\n");
                    if (g_remote_fd != -1) {
                        close(g_remote_fd);
                        g_remote_fd = -1;
                    }
                } else {
                    handle_remote_ws_read();  // Also assumes mutex where needed
                    if (remote_socket_is_dead(g_remote_fd)) {
                        fprintf(stderr, "Remote WebSocket became invalid after read. Reconnecting...\n");
                        close(g_remote_fd);
                        g_remote_fd = -1;
                    } else {
                        last_remote_activity = monotonic_now_sec();
                    }
                }
            } else if (fd == timer_fd) {
                uint64_t expirations;
                read(timer_fd, &expirations, sizeof(expirations));

                uint8_t ping_buf[BUFFER_SIZE];
                size_t ping_size = sizeof(ping_buf);
                ws_create_control_frame(WS_PING_FRAME, NULL, 0, ping_buf, &ping_size);

                pthread_mutex_lock(&g_clients_mutex);
                for (int i = 0; i < MAX_CLIENTS; i++) {
                    if (g_clients[i].fd != -1) {
                        send(g_clients[i].fd, ping_buf, ping_size, 0);
                    }
                }
                pthread_mutex_unlock(&g_clients_mutex);

                if (g_remote_fd != -1) {
                    time_t now = monotonic_now_sec();
                    if ((now - last_remote_activity) >= REMOTE_PING_TIMEOUT_SEC) {
                        // send ping frame to remote
                        //fprintf(stderr, "No activity from remote WebSocket for %d seconds. Sending ping...\n", REMOTE_PING_TIMEOUT_SEC);
                        uint8_t remote_ping_buf[BUFFER_SIZE];
                        size_t remote_ping_size = sizeof(remote_ping_buf);
                        ws_create_control_frame(WS_PING_FRAME, NULL, 0, remote_ping_buf, &remote_ping_size);
                        if (send(g_remote_fd, remote_ping_buf, remote_ping_size, 0) < 0) {
                            perror("send(): remote ping");
                           // fprintf(stderr, "Failed to send ping to remote WebSocket. Reconnecting...\n");
                            close(g_remote_fd);
                            g_remote_fd = -1;
                        }
                    }
                    if ((now - last_remote_activity) >= REMOTE_STALL_TIMEOUT_SEC) {
                        //fprintf(stderr, "Remote WebSocket timed out (no activity for %d seconds). Reconnecting...\n", REMOTE_STALL_TIMEOUT_SEC);
                        close(g_remote_fd);
                        g_remote_fd = -1;
                    }
                }
            } else {
                client_t *client = (client_t *)events[i].data.ptr;
                if (client) {
                    // printf("DC:FD %d ->", client->fd);
                    // printf("Data from client incoming\n");
                    handle_client_read(client);  // Assumes internal locking if it modifies clients
                }
            }

            if (running && g_remote_fd == -1) {
                if (connect_remote_with_fallback(&connected_ip) < 0) {
                    break;
                }

                struct epoll_event remote_ev;
                remote_ev.events = EPOLLIN | EPOLLET | EPOLLRDHUP;
                remote_ev.data.fd = g_remote_fd;
                if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, g_remote_fd, &remote_ev) < 0) {
                    perror("epoll_ctl(): remote_fd reconnect");
                    running = 0;
                    break;
                }

                last_remote_activity = monotonic_now_sec();
            }
        }
    }

    cleanup();
    return EXIT_SUCCESS;
}