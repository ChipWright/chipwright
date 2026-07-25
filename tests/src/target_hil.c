// POSIX/BSD serial I/O, requested before any system header so the termios prototypes and
// baud-rate constants are visible under -std=c11 on both Linux (_DEFAULT_SOURCE) and macOS
// (_DARWIN_C_SOURCE).
#define _DEFAULT_SOURCE
#define _DARWIN_C_SOURCE

#include "openhome/test.h"

#include "target_hil.h"

#include <fcntl.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <termios.h>
#include <time.h>
#include <unistd.h>

// Hardware-in-the-loop backend (branch 6). It drives a real board over its serial console:
// the reference firmware streams telemetry as "telemetry metric=<key> value=<v> unit=<u>"
// lines, which this backend parses to satisfy read_sensor, so the same acceptance suites run
// against physical silicon unchanged. Enable it by setting OPENHOME_HIL_PORT to the board's
// serial device; without it the target reports unavailable and the runner skips it, so CI
// (which has no board) is unaffected.
//
// set_mode writes a "command key=<key> mode=<mode>" line to the same console and waits for the
// firmware's "actuator key=<key> mode=<mode>" acknowledgment, so actuator control is a real,
// confirmed operation on hardware rather than an assumption.

static int g_fd = -1;

static double monotonic_seconds(void) {
  struct timespec ts;
  clock_gettime(CLOCK_MONOTONIC, &ts);
  return (double)ts.tv_sec + (double)ts.tv_nsec / 1e9;
}

// Reads one newline-terminated line into buf within timeout_s. Returns the line length, or
// -1 on timeout. Carriage returns are dropped so lines compare cleanly.
static int read_line(char *buf, size_t cap, double timeout_s) {
  size_t n = 0;
  const double deadline = monotonic_seconds() + timeout_s;
  while (monotonic_seconds() < deadline) {
    char c;
    const ssize_t r = read(g_fd, &c, 1);
    if (r == 1) {
      if (c == '\n') {
        buf[n] = '\0';
        return (int)n;
      }
      if (c != '\r' && n + 1 < cap) {
        buf[n++] = c;
      }
    }
  }
  buf[n] = '\0';
  return -1;
}

static oh_status_t hil_connect(void *ctx) {
  (void)ctx;
  // Allow time for the board to reset and boot after the port opens, then confirm it is
  // actually streaming telemetry.
  char line[160];
  const double deadline = monotonic_seconds() + 8.0;
  while (monotonic_seconds() < deadline) {
    if (read_line(line, sizeof line, deadline - monotonic_seconds()) >= 0 &&
        strstr(line, "telemetry") != NULL) {
      return OH_OK;
    }
  }
  return OH_ERR_IO;
}

static oh_status_t hil_read_sensor(void *ctx, const char *key, float *out_value) {
  (void)ctx;
  char line[160];
  char metric[64];
  float value = 0.0f;
  const double deadline = monotonic_seconds() + 3.0;
  while (monotonic_seconds() < deadline) {
    if (read_line(line, sizeof line, deadline - monotonic_seconds()) < 0) {
      break;
    }
    if (sscanf(line, "telemetry metric=%63s value=%f", metric, &value) == 2 &&
        strcmp(metric, key) == 0) {
      *out_value = value;
      return OH_OK;
    }
  }
  // The key never appeared in the stream: unknown sensor, as far as this target can tell.
  return OH_ERR_NOT_FOUND;
}

static oh_status_t hil_set_mode(void *ctx, const char *key, int mode) {
  (void)ctx;
  char command[96];
  const int written = snprintf(command, sizeof command, "command key=%s mode=%d\n", key, mode);
  if (written <= 0 || (size_t)written >= sizeof command) {
    return OH_ERR_INVALID;
  }
  if (write(g_fd, command, (size_t)written) != written) {
    return OH_ERR_IO;
  }

  // Wait for the firmware to acknowledge the applied mode, so a passing check means the board
  // actually drove the actuator, not merely that the command was sent.
  char expected[96];
  snprintf(expected, sizeof expected, "actuator key=%s mode=%d", key, mode);
  char line[160];
  const double deadline = monotonic_seconds() + 3.0;
  while (monotonic_seconds() < deadline) {
    if (read_line(line, sizeof line, deadline - monotonic_seconds()) < 0) {
      break;
    }
    if (strcmp(line, expected) == 0) {
      return OH_OK;
    }
  }
  return OH_ERR_IO;
}

void oh_test_target_hil_init(oh_test_target_t *target) {
  target->connect = hil_connect;
  target->read_sensor = hil_read_sensor;
  target->set_mode = hil_set_mode;
  target->ctx = NULL;

  const char *port = getenv("OPENHOME_HIL_PORT");
  if (port == NULL) {
    target->name = "hil (set OPENHOME_HIL_PORT to enable)";
    target->available = false;
    return;
  }

  const int fd = open(port, O_RDWR | O_NOCTTY | O_NONBLOCK);
  struct termios tio;
  if (fd < 0 || tcgetattr(fd, &tio) != 0) {
    if (fd >= 0) {
      close(fd);
    }
    target->name = "hil (port unavailable)";
    target->available = false;
    return;
  }
  cfmakeraw(&tio);
  cfsetispeed(&tio, B115200);
  cfsetospeed(&tio, B115200);
  tio.c_cc[VMIN] = 0;
  tio.c_cc[VTIME] = 1;
  tcsetattr(fd, TCSANOW, &tio);
  fcntl(fd, F_SETFL, 0);  // clear O_NONBLOCK so reads honor VTIME instead of spinning

  g_fd = fd;
  target->name = "hil (hardware)";
  target->available = true;
}
