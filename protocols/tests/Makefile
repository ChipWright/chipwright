# Builds and runs the protocol layer unit tests on the host.

PROTO := ..
SDK := ../../sdk/firmware
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -I$(SDK)/include -I$(PROTO)/include
SRCS := test_protocol.c $(PROTO)/src/transport_sim.c $(PROTO)/src/matter.c
BIN := build/test_protocol

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
