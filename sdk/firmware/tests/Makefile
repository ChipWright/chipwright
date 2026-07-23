# Builds and runs the SDK and HAL unit tests on the host.

SDK := ..
CC ?= cc
CFLAGS := -std=c11 -Wall -Wextra -Werror -I$(SDK)/include
SRCS := test_main.c $(SDK)/src/hal.c $(SDK)/src/sdk.c $(SDK)/src/log.c
BIN := build/test_main

.PHONY: run clean

run: $(BIN)
	./$(BIN)

$(BIN): $(SRCS)
	@mkdir -p build
	$(CC) $(CFLAGS) $(SRCS) -o $(BIN)

clean:
	rm -rf build
