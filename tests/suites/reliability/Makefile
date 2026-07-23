# Builds and runs the reliability soak suite.

TESTS := ../..
SIM := ../../../simulator
PROTO := ../../../protocols
SDK := ../../../sdk/firmware
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror \
	-I$(TESTS)/include -I$(SIM)/include -I$(PROTO)/include -I$(SDK)/include
SRCS := main.c \
	$(TESTS)/src/assert.c \
	$(SIM)/src/source.c \
	$(SIM)/src/fault.c \
	$(SIM)/src/twin.c \
	$(PROTO)/src/transport_sim.c \
	$(PROTO)/src/matter.c \
	$(SDK)/src/hal.c \
	$(SDK)/src/sdk.c \
	$(SDK)/src/log.c
BIN := build/reliability_suite

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
