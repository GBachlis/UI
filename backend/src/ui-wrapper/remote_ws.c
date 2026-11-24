#define _POSIX_C_SOURCE 200809L

#include "remote_ws.h"
#include "common_ws.h"
#include "frontend_ws.h" // for broadcast_sensor_data()

#include "websocket.h"
#include "wshandshake.h"
#include "cJSON.h"
#include <string.h>
#include <time.h>
#include <unistd.h>
#include <inttypes.h>
#include <stdio.h>
#include <stdlib.h>
#include <errno.h> 
#include <math.h>


FILE* csv_file = NULL;
char csv_filename[256] = {0};


double cold_junction_1 = 25; //Red
double cold_junction_2 = 0; //Yellow (not used)

sensor_id_map_t sensor_id_map[] = {
    {0x600, 0, "CJ-1"}, // Cold Junction for TC-1 to TC-3: Index 0
    {0x602, 0, "CJ-2"}, // Cold Junction for TC-4 to TC-8: Index 1
    
    {0x408, 0.0, "TC-1"}, // Thermocouples: Index 2 - 9
    {0x410, 0.0, "TC-2"},
    {0x418, 0.0, "TC-3"},
    {0x420, 0.0, "TC-4"},
    {0x40A, 0.0, "TC-5"},
    {0x412, 0.0, "TC-6"},
    {0x41A, 0.0, "TC-7"},
    {0x422, 0.0, "TC-8"},
    {0x509, 0.0, "RTD-VENT"}, // RTDs: Index 10 - 12
    {0x511, 0.0, "RTD-MIDDLE"},
    {0x519, 0.0, "RTD-TOP"},
    {0x521, 0.0, "RTD-BOTTOM"},
    {0x529, 0.0, "RTD-5"},
    {0x118, 1.0, "PT-M1"}, // Blue 1 // Pressure Transducers: Index 13 - 21 vghke to blue 1(10a) to kanw red 3(118)
    {0x000, 1.0, "PT-M2"}, // Blue 3 
    {0x119, 1.0, "PT-C"},  // Red 1->GREEN 3 
    {0x11A, 1.0, "PT-N2"}, // Green 2 
    {0x108, 1.0, "PT-ED"}, // ->RED 1
    {0x110, 1.0, "PT-P"}, // Red 2
    {0x111, 1.0, "PT-LD"}, // blue 2->GREEN 2 
    {0x112, 1.0, "PT-LU"},  // Green 3 -> BLUE 3 
    {0x000, 1.0, "PT-FS"},
    {0x70c, 0.0, "F-LFBV"},
    {0x709, 0.0, "R-LMBV"},
    {0x711, 0.0, "R-PVBV"},
    {0x701, 0.0, "R-PMBV"},
    {0x70a, 0.0, "R-EMBV"},
    {0x712, 0.0, "R-LVBV"},
    {0x70b, 0.0, "F-LVBV"},
    {0x702, 0.0, "R-EVBV"},
    {0x20a, 0.0, "LC-T"}, // Load Cells: Index 26 - 28
    {0x209, 0.0, "LC-L"},
    {0x210, 0.0, "LC-E"},
    {0x001, 0.0, "PYRO"},  
    {0x002, 0.0, "OXYGEN"}  
};

#define SENSOR_ID_MAP_SIZE_MACRO  (sizeof(sensor_id_map)/sizeof(sensor_id_map[0]))

size_t SENSOR_ID_MAP_SIZE = SENSOR_ID_MAP_SIZE_MACRO;

latest_sensor_data_t latest_sensor_state[SENSOR_ID_MAP_SIZE_MACRO] = {0};



int initialize_csv_logging(void)
{
    time_t now = time(NULL);
    struct tm *t = localtime(&now);
    strftime(csv_filename, sizeof(csv_filename), "sensor_log_%Y%m%d_%H%M%S.csv", t);

    csv_file = fopen(csv_filename, "w");
    if (csv_file) {
        fprintf(csv_file, "sys_time,mcu_timestamp,sensor_name,raw_value,corrected_value,warning\n");
        fflush(csv_file);
        return 0;              /* success */
    }
    perror("Failed to create CSV file");
    return -1;                 /* failure */
}


double apply_sensor_calculations(size_t index, uint16_t sensor_value) {
    switch (index) {
        case 0: {
            cold_junction_1 = (((3.3*sensor_value)/65536)-0.5)/0.01; 
            return cold_junction_1;
        }
        case 1: {
            cold_junction_2 = (100*(((3.3*sensor_value)/65536)-0.5)-3);
            return cold_junction_2;
        }
        case 2: // TC-1
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id] ); //celcius 
        case 3: // TC-2
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 4: // TC-3
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 5: // TC-4
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 6: // TC-5
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 7: // TC-6
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 8: // TC-7
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 9: // TC-8
            return (-1000000*(((3.3*sensor_value)/65536)-1.235)/(30*30) + cold_junction_1 +sensor_offset_map[sensor_id_map[index].id]);
        case 10: // RTD-1
            return ((14961935 - 510*sensor_value) / (0.385*sensor_value + 46282.39));
        case 11: // RTD-2
            return ((14961935 - 510*sensor_value) / (0.385*sensor_value + 46282.39));
        case 12: // RTD-3
            return ((14961935 - 510*sensor_value) / (0.385*sensor_value + 46282.39));
        case 13: // RTD-4
            return ((14961935 - 510*sensor_value) / (0.385*sensor_value + 46282.39));
        case 14: // RTD-5
            return ((14961935 - 510*sensor_value) / (0.385*sensor_value + 46282.39));
        case 15: // PT-M1
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 16: // PT-M2
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 17: // PT-C
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 18: // PT-N2
            return (((3.3*sensor_value)/65536)*(400/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 19: // PT-ED
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 20: // PT-P
            return (((3.3*sensor_value)/65536)*(400/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 21: // PT-LD
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 22: // PT-LU
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 23: // PT-FS
            return (((3.3*sensor_value)/65536)*(100/5)*(23.3/13.3)+sensor_offset_map[sensor_id_map[index].id]);
        case 24: // R-EMBV
            return(sensor_value);
        case 25: // R-LMBV
            return (1.5*sensor_value);
        case 26:
            return(sensor_value);
        case 27:
            return(sensor_value); 
        case 28:
            return(sensor_value);
        case 29:
            return(sensor_value);
        case 30:
            return(sensor_value);
        case 31:
            return (double)sensor_value; //number
        case 32: // LC-T
            return((300/5)*1000*(3.3*sensor_value/65536-1.235)/(380)+sensor_offset_map[sensor_id_map[index].id]); //kg 210 red 
        case 33: // LC-L
            return (((300/(2*2.5))*1000*(3.3*sensor_value/65536-1.235)/(380))+sensor_offset_map[sensor_id_map[index].id]); //L
        case 34: // LC-E
            return ((300/(2*2.5))*1000*(3.3*sensor_value/65536-1.235)/(380)+sensor_offset_map[sensor_id_map[index].id]); //L
        case 35: // PYRO
            return (double)sensor_value/10.0; //celcius
        case 36: // OXYGEN
            return (double)sensor_value/10.0; //percentage
        default:
            return (double)sensor_value;
    } 
}

const char* get_sensor_name(int id) {
    for (size_t i = 0; i < SENSOR_ID_MAP_SIZE; i++) {
        if (sensor_id_map[i].id == id) return sensor_id_map[i].name;
    }
    return NULL;
}

void parse_id_value_data(const char *data) {
    char *copy = strdup(data);
    if (!copy) return;


    char *token = strtok(copy, "|");
    uint64_t timestamp_ns = 0;
    if (token) {
        timestamp_ns = strtoull(token, NULL, 10);
        token = strtok(NULL, "|");
    }

    while (token) {
        uint32_t id = 0;
        uint16_t value = 0;

        if (sscanf(token, "%"SCNx32"#%"SCNx16"", &id, &value) == 2) {
            for (size_t i = 0; i < SENSOR_ID_MAP_SIZE; i++) {
                if (sensor_id_map[i].id == id) {
                    double processed_value = apply_sensor_calculations(i, value);

                    struct timespec ts;
                    clock_gettime(CLOCK_REALTIME, &ts);

                    latest_sensor_state[i].value = processed_value;
                    latest_sensor_state[i].timestamp = timestamp_ns;
                    latest_sensor_state[i].valid = 1;
                    strncpy(latest_sensor_state[i].name, sensor_id_map[i].name, sizeof(latest_sensor_state[i].name) - 1);

                    // warning logic
                    latest_sensor_state[i].warning = set_sensor_warning(i,processed_value);

                    // CSV Logging
                    if (csv_file) {
                        double corrected_value = processed_value - sensor_offset_map[i];
                        struct tm *tinfo = localtime(&ts.tv_sec);
                        char time_str[32];
                        strftime(time_str, sizeof(time_str), "%Y-%m-%d %H:%M:%S", tinfo);
                        fprintf(csv_file, "%s.%03ld,%" PRIu64 ",%s,%f,%f,%d\n",
                                time_str, ts.tv_nsec / 1000000, timestamp_ns, sensor_id_map[i].name, processed_value, corrected_value, latest_sensor_state[i].warning);
                        fflush(csv_file);
                    }
                    break;
                }
            }
        }

        token = strtok(NULL, "|");
    }

    free(copy);
}

// Connect to the remote WebSocket sensor data server.
int connect_remote_ws(const char *ip, int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    printf("CN:FD: %d ->", fd);
    if (fd < 0) {
        perror("socket() remote");
        return -1;
    }
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_port = htons(port);
    if (inet_pton(AF_INET, ip, &addr.sin_addr) <= 0) {
        perror("inet_pton()");
        close(fd);
        return -1;
    }
    if (connect(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("connect() remote");
        close(fd);
        return -1;
    }
    printf("Connected to remote WebSocket server at %s:%d\n", ip, port);
    static const char client_request[] =
        "GET /chat HTTP/1.1\r\n"
        "Host: ws://192.168.88.14:8080\r\n" //192.168.88.14
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"  /* RFC 6455 sample */
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n";
    uint8_t out_buf[512];
    size_t out_len = sizeof(out_buf);
    http_header hdr = {0};
    memcpy(out_buf, client_request, sizeof(client_request));
    
    // ws_handshake(&hdr, out_buf, sizeof(client_request), &out_len);
    ssize_t bytes =  send(fd, out_buf, sizeof(client_request), 0);
    if (bytes < 0){
        return -1;
    }
    return fd;
}


int set_sensor_warning(size_t index, uint16_t sensor_value) {
    switch (index) {
        case 0: 
        case 1:
        case 2: // TC-1
        case 3: // TC-2
        case 4: // TC-3
        case 5: // TC-4
        case 6: // TC-5
        case 7: // TC-6
        case 8: // TC-7
        case 9: // TC-8
            return 0;
        case 10: // RTD-1
            return 0;
        case 11: // RTD-2
            return 0;
        case 12: // RTD-3
            return 0;
        case 13: // RTD-4
            return 0;
        case 14: // RTD-5
            return 0;
        case 15: // PT-M1
            return (sensor_value < 35) ? 0 : ((sensor_value < 40) ? 1 : 2);
        case 16: // PT-M2
            return (sensor_value < 35) ? 0 : ((sensor_value < 40) ? 1 : 2);
        case 17: // PT-C
            return (sensor_value < 41) ? 0 : ((sensor_value < 45) ? 1 : 2);
        case 18: // PT-N2
            return (sensor_value < 75) ? 0 : ((sensor_value < 85) ? 1 : 2);
        case 19: // PT-ED
            return 0;
        case 20: // PT-P
            return (sensor_value < 200) ? 0 : ((sensor_value < 220) ? 1 : 2);
        case 21: // PT-LD
            return 0;
        case 22: // PT-LU
            return (sensor_value < 75) ? 0 : ((sensor_value < 85) ? 1 : 2);
        case 23: // PT-FS
            return 0;
        case 24: // R-EMBV
        case 25: // R-LMBV
        case 26: // R-EVBV
        case 27: // R-LVBV
        case 28:
        case 29:
        case 30:
        case 31:
        case 32:
        case 33: // LC-T
        case 34: // LC-L
        case 35: // LC-E
        case 36: // PYRO
        case 37: // OXYGEN
            return 0;
        default:
            return 0;
    } 
}

void handle_remote_ws_read() {
    uint8_t recv_buf[BUFFER_SIZE];
    ssize_t n = recv(g_remote_fd, recv_buf, sizeof(recv_buf), 0);
    if (n <= 0) {
        if (n < 0 && (errno == EAGAIN || errno == EWOULDBLOCK)) return;
        printf("Remote WS connection lost. Reconnecting in 10 seconds...\n");
        close(g_remote_fd);

        while ((g_remote_fd = connect_remote_ws(REMOTE_WS_IP, REMOTE_WS_PORT)) < 0) {
            fprintf(stderr, "Reconnection attempt failed. Retrying...\n");
            sleep(1);
        }

        struct epoll_event ev;
        ev.events = EPOLLIN | EPOLLET;
        ev.data.fd = g_remote_fd;
        if (epoll_ctl(epoll_fd, EPOLL_CTL_ADD, g_remote_fd, &ev) < 0) {
            perror("epoll_ctl(): server_fd");
            return;
        }
        return;
    }

    ws_frame frame;
    memset(&frame, 0, sizeof(frame));
    ws_parse_frame(&frame, recv_buf, n);

    if (frame.type == WS_TEXT_FRAME && frame.payload) {
        char *text = strndup((char *)frame.payload, frame.payload_length);
        if (text) {
            parse_id_value_data(text);
            free(text);
        }
    }
    
    broadcast_sensor_data();
}
