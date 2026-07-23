# Builds the reference thermostat firmware for the native host.
#
# The interface header is generated from the device manifest by @openhome/device-engine,
# so the engine must be built first: pnpm --filter @openhome/device-engine build

SDK := ../..
REPO := $(SDK)/../..
ENGINE_CLI := $(REPO)/core/device-engine/dist/cli.js
MANIFEST := $(REPO)/examples/thermostat/device.yaml

GEN := build/gen
GEN_HEADER := $(GEN)/firmware/smart_thermostat_interface.h
BIN := build/thermostat

CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror \
	-I$(SDK)/include -I$(SDK)/bsp/native -I$(GEN)/firmware
SRCS := main.c \
	$(SDK)/src/log.c \
	$(SDK)/src/hal.c \
	$(SDK)/src/sdk.c \
	$(SDK)/bsp/native/native_bsp.c

.PHONY: all run clean

all: $(BIN)

$(GEN_HEADER): $(MANIFEST) $(ENGINE_CLI)
	node $(ENGINE_CLI) compile $(MANIFEST) --out $(GEN)

$(BIN): $(GEN_HEADER) $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

run: $(BIN)
	./$(BIN)

clean:
	rm -rf build
