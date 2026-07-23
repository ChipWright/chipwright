# Builds and runs the thermostat digital-twin demonstration.

SIM := ../..
SDK := ../../../sdk/firmware
PROTO := ../../../protocols
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -I$(SDK)/include -I$(PROTO)/include -I$(SIM)/include
SRCS := main.c \
	$(SIM)/src/source.c \
	$(SIM)/src/fault.c \
	$(SIM)/src/twin.c \
	$(PROTO)/src/transport_sim.c \
	$(PROTO)/src/matter.c \
	$(SDK)/src/hal.c \
	$(SDK)/src/sdk.c \
	$(SDK)/src/log.c
BIN := build/thermostat_twin

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
