# Builds the controllable twin used by the developer IDE's live telemetry debugger.

SIM := ../..
SDK := ../../../sdk/firmware
PROTO := ../../../protocols
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -I$(SDK)/include -I$(PROTO)/include -I$(SIM)/include
SRCS := main.c \
	$(SIM)/src/source.c \
	$(SIM)/src/fault.c \
	$(SDK)/src/hal.c \
	$(SDK)/src/sdk.c \
	$(SDK)/src/log.c
BIN := build/twin_studio

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
