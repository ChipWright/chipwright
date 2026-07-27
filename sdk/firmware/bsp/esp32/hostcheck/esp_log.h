#ifndef CHIPWRIGHT_HOSTCHECK_ESP_LOG_H
#define CHIPWRIGHT_HOSTCHECK_ESP_LOG_H

#include <stdio.h>

// Minimal stand-in for the ESP-IDF logging macro, used only for host compile checking.
#define ESP_LOGI(tag, ...) ((void)(tag), (void)fprintf(stderr, __VA_ARGS__))

#endif  // CHIPWRIGHT_HOSTCHECK_ESP_LOG_H
