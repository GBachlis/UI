#define _POSIX_C_SOURCE 200809L
#include "frontend_ws.h"
#include "common_ws.h"
#include "remote_ws.h" // for sensor_buffer, warnings

#include "wshandshake.h"
#include "websocket.h"
#include "cJSON.h"
#include <time.h>
#include <errno.h>
#include <math.h>
#include <inttypes.h>

extern latest_sensor_data_t latest_sensor_state[];
extern size_t SENSOR_ID_MAP_SIZE;
extern float sensor_offset_map[0x7FF] = {0};
extern double cold_junction_1;

static float find_default_value_for_sensor(int id) {
    for (size_t i = 0; i < SENSOR_ID_MAP_SIZE; i++) {
        if (sensor_id_map[i].id == id) {
            // If the sensor is a TC- sensor, return the current value of cold_junction_1
            if (strncmp(sensor_id_map[i].name, "TC-", 3) == 0) {
                return cold_junction_1;
            }
            return sensor_id_map[i].default_value;
        }
    }
    return 0; // Default fallback value
}

static int update_sensor_offsets(const char *data, size_t length) {
    char *msg = strndup(data, length);
    if (!msg) return -1;

    // expected format: "ID#SET or ID#RESET"
    uint16_t id = 0;
    char command[16] = {0};
    if (sscanf(msg, "%"SCNd16"#%15s", &id, command) == 2) {
        if (strcmp(command, "SET") == 0) {
            float default_value = find_default_value_for_sensor(id);
            printf("Default value for sensor ID 0x%X is %f\n", id, default_value);
            float latest_sensor_value = default_value;
            for (size_t i = 0; i < SENSOR_ID_MAP_SIZE; i++) {
                if (sensor_id_map[i].id == id) {
                    latest_sensor_value = (float)(latest_sensor_state[i].value);
                    break;
                }
            }
            float offset = default_value - latest_sensor_value;
            sensor_offset_map[id] += offset;
            printf("Sensor ID 0x%X offset set to %f\n", id, sensor_offset_map[id]);
        } else if (strcmp(command, "RESET") == 0) {
            sensor_offset_map[id] = 0;
            printf("Sensor ID 0x%X offset reset to 0\n", id);
        }
    }
}

/*-------------------- Frontend Client Handling --------------------*/
// Accept a new frontend client connection.
void handle_new_client()
{
    struct sockaddr_in client_addr;
    socklen_t addr_len = sizeof(client_addr);
    int client_fd = accept(g_server_fd, (struct sockaddr *)&client_addr, &addr_len);
    if (client_fd < 0)
    {
        if (errno != EAGAIN && errno != EWOULDBLOCK)
            perror("accept()");
        return;
    }
    set_nonblocking(client_fd);
    // Find a free slot for the new client.
    pthread_mutex_lock(&g_clients_mutex);
    for (int i = 0; i < MAX_CLIENTS; i++)
    {
        if (g_clients[i].fd == -1)
        {
            g_clients[i].fd = client_fd;
            g_clients[i].handshake_done = false;
            g_clients[i].buffer_len = 0;
            // add_to_epoll(client_fd, EPOLLIN | EPOLLET, &g_clients[i]);
            struct epoll_event ev;
            ev.events = EPOLLIN | EPOLLET;
            ev.data.ptr = &g_clients[i];
            if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, client_fd, &ev) < 0)
            {
                perror("epoll_ctl(): new client");
                close(client_fd);
                g_clients[i].fd = -1;
            }
            else
            {
                printf("New frontend client connected. FD = %d\n", client_fd);
            }
            pthread_mutex_unlock(&g_clients_mutex);
            return;
        }
    }
    pthread_mutex_unlock(&g_clients_mutex);
    printf("Max clients reached, rejecting connection.\n");
    close(client_fd);
}

// Close a frontend client connection.
void close_client(client_t *client)
{
    if (client->fd != -1)
    {
        remove_from_epoll(client->fd);
        close(client->fd);
        client->fd = -1;
        client->handshake_done = false;
        client->buffer_len = 0;
    }
}

// Send a text message (as a WebSocket frame) to a specific frontend client.
static void ws_send_text(int fd, const char *msg)
{
    uint8_t out_buf[BUFFER_SIZE];
    size_t out_size = sizeof(out_buf);
    ws_frame frame;
    memset(&frame, 0, sizeof(frame));
    frame.type = WS_TEXT_FRAME;
    frame.payload = (uint8_t *)msg;
    frame.payload_length = strlen(msg);
    ws_create_frame(&frame, out_buf, &out_size);
    if (send(fd, out_buf, out_size, 0) < 0)
    {
        perror("send() ws_send_text");
    }
}

//  // Broadcast a text message to all connected (and handshaken) frontend clients.
//  static void broadcast_text(const char *msg)
//  {
//      for (int i = 0; i < MAX_CLIENTS; i++)
//      {
//          if (g_clients[i].fd != -1 && g_clients[i].handshake_done)
//          {
//              ws_send_text(g_clients[i].fd, msg);
//          }
//      }
//  }

// Broadcast the buffered sensor data to all connected frontend clients
// and then clear the sensor buffer.
void broadcast_sensor_data(void)
{

    /* 100-ms throttle (local static timestamp) */
    static uint64_t last_ms = 0;
    struct timespec ts;
    clock_gettime(CLOCK_REALTIME, &ts);
    uint64_t now_ms = (uint64_t)ts.tv_sec * 1000 + ts.tv_nsec / 1000000;
    if (now_ms - last_ms < 100)
        return;
    last_ms = now_ms;

    /* build JSON array from the current sensor state */
    cJSON *json_arr = cJSON_CreateArray();
    if (!json_arr)
        return;

    for (size_t i = 0; i < SENSOR_ID_MAP_SIZE; ++i)
    {
        if (!latest_sensor_state[i].valid)
            continue;

        cJSON *obj = cJSON_CreateObject();
        cJSON_AddStringToObject(obj, "name", latest_sensor_state[i].name);
        cJSON_AddNumberToObject(obj, "value", round(latest_sensor_state[i].value * 100.0) / 100.0);
        cJSON_AddNumberToObject(obj, "timestamp", latest_sensor_state[i].timestamp); /* ms */
        cJSON_AddNumberToObject(obj, "warning", latest_sensor_state[i].warning);
        cJSON_AddItemToArray(json_arr, obj);
    }

    char *json_str = cJSON_PrintUnformatted(json_arr);
    cJSON_Delete(json_arr);
    if (!json_str)
        return;

    /* wrap in a WebSocket text frame */
    uint8_t ws_buf[BUFFER_SIZE];
    size_t ws_len = sizeof(ws_buf);
    ws_create_text_frame(json_str, ws_buf, &ws_len);
    free(json_str);

    /* send to every connected, hand-shaken frontend client */
    for (int i = 0; i < MAX_CLIENTS; ++i)
    {

        if (g_clients[i].fd != -1 && g_clients[i].handshake_done)
        {
            if (send(g_clients[i].fd, ws_buf, ws_len, 0) < 0)
                perror("send() broadcast_sensor_data");
        }
    }
}

/*-------------------- Frontend Client Read Handling --------------------*/
// Handle data from a frontend client. Here we process handshake data if needed.
void handle_client_read(client_t *client)
{
    while (1)
    {
        uint8_t recv_buf[BUFFER_SIZE];
        ssize_t n = recv(client->fd, recv_buf, sizeof(recv_buf), 0);
        if (n <= 0)
        {
            if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK))
                break;
            printf("Client FD %d disconnected.\n", client->fd);
            close_client(client);
            break;
        }
        if (!client->handshake_done)
        {
            if (client->buffer_len + n > BUFFER_SIZE)
            {
                printf("Handshake buffer overflow for client FD %d\n", client->fd);
                close_client(client);
                break;
            }
            memcpy(client->buffer + client->buffer_len, recv_buf, n);
            client->buffer_len += n;
            http_header header;
            memset(&header, 0, sizeof(header));
            size_t out_len = BUFFER_SIZE;
            ws_handshake(&header, client->buffer, client->buffer_len, &out_len);
            if (header.type == WS_OPENING_FRAME)
            {
                send(client->fd, client->buffer, out_len, 0);
                client->handshake_done = true;
                //  ws_send_text(client->fd, "Welcome to sensor server");
                printf("Client FD %d handshake done (Key=%s)\n", client->fd, header.key);
                client->buffer_len = 0;
            }
            else if (out_len > 0)
            {
                send(client->fd, client->buffer, out_len, 0);
                close_client(client);
                break;
            }
        }
        else
        {
            ws_frame frame;
            memset(&frame, 0, sizeof(frame));
            ws_parse_frame(&frame, recv_buf, n);
            if (frame.type == WS_TEXT_FRAME)
            {
                printf("Received command from client FD %d: %.*s\n", client->fd, (int)frame.payload_length, frame.payload);
                update_sensor_offsets((char *)frame.payload, frame.payload_length);
            }
            if (frame.type == WS_PING_FRAME)
            {
                uint8_t pong_buf[BUFFER_SIZE];
                size_t pong_size = sizeof(pong_buf);
                ws_create_control_frame(WS_PONG_FRAME, frame.payload, frame.payload_length, pong_buf, &pong_size);
                send(client->fd, pong_buf, pong_size, 0);
            }
        }
    }
}