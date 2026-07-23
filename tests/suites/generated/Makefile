# Generates the acceptance suite from the device manifest, then compiles and runs it
# against the twin. Requires the device engine to be built first:
#   pnpm --filter @openhome/device-engine build

TESTS := ../..
REPO := $(TESTS)/..
SIM := $(REPO)/simulator
PROTO := $(REPO)/protocols
SDK := $(REPO)/sdk/firmware
ENGINE_CLI := $(REPO)/core/device-engine/dist/cli.js
MANIFEST := $(REPO)/examples/thermostat/device.yaml

GEN := build/gen
GEN_SUITE := $(GEN)/tests/smart_thermostat_generated.c
BIN := build/generated_suite

CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror \
	-I$(TESTS)/include -I$(TESTS)/src \
	-I$(SIM)/include -I$(PROTO)/include -I$(SDK)/include
SRCS := main.c \
	$(GEN_SUITE) \
	$(TESTS)/src/assert.c \
	$(TESTS)/src/target_twin.c \
	$(SIM)/src/source.c \
	$(SIM)/src/fault.c \
	$(SIM)/src/twin.c \
	$(PROTO)/src/transport_sim.c \
	$(PROTO)/src/matter.c \
	$(SDK)/src/hal.c \
	$(SDK)/src/sdk.c \
	$(SDK)/src/log.c

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(GEN_SUITE): $(MANIFEST) $(ENGINE_CLI)
	node $(ENGINE_CLI) compile $(MANIFEST) --out $(GEN)

$(BIN): $(GEN_SUITE) main.c
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
