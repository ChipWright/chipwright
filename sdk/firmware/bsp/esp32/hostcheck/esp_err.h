#ifndef CHIPWRIGHT_HOSTCHECK_ESP_ERR_H
#define CHIPWRIGHT_HOSTCHECK_ESP_ERR_H

// Minimal ESP-IDF declarations for host compile checking only. A real firmware build
// uses the genuine ESP-IDF headers on the include path instead of this directory.

typedef int esp_err_t;
#define ESP_OK 0

#endif  // CHIPWRIGHT_HOSTCHECK_ESP_ERR_H
