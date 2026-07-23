# Builds and runs the connectivity suite.

TESTS := ../..
PROTO := ../../../protocols
SDK := ../../../sdk/firmware
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror \
	-I$(TESTS)/include -I$(PROTO)/include -I$(SDK)/include
SRCS := main.c \
	$(TESTS)/src/assert.c \
	$(PROTO)/src/transport_sim.c \
	$(PROTO)/src/matter.c
BIN := build/connectivity_suite

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
