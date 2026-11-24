#ifndef REMOTE_WS_H
#define REMOTE_WS_H

#include "common_ws.h" // for sensor_data_t, BUFFER_SIZE
#include "config.h"

#define PIPELINE_BATCH_SIZE 100

typedef struct {
    char name[32];
    double value;
    uint64_t timestamp;
    int warning;
    int valid;
} latest_sensor_data_t;

typedef struct {
    int id;
    float default_value;
    const char *name;
} sensor_id_map_t;

extern latest_sensor_data_t latest_sensor_state[];
extern sensor_id_map_t sensor_id_map[];
extern size_t SENSOR_ID_MAP_SIZE;
extern double cold_junction_1;

int connect_remote_ws(const char *ip, int port);
void handle_remote_ws_read();
int set_sensor_warning(size_t index, uint16_t sensor_value);

// New additions
int initialize_csv_logging();
double apply_sensor_calculations(size_t index, uint16_t sensor_value);

#endif // REMOTE_WS_H
