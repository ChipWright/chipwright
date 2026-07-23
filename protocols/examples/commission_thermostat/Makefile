# Builds and runs the Matter commissioning demonstration.

PROTO := ../..
SDK := ../../../sdk/firmware
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -I$(SDK)/include -I$(PROTO)/include
SRCS := main.c $(PROTO)/src/transport_sim.c $(PROTO)/src/matter.c
BIN := build/commission_thermostat

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
