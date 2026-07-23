# Aggregate targets for the firmware SDK. Individual subdirectories carry their own
# Makefiles; this file runs them together for local checks and CI.

.PHONY: test hostcheck-esp32 example clean

test:
	$(MAKE) -C tests run

hostcheck-esp32:
	$(MAKE) -C bsp/esp32 hostcheck

example:
	$(MAKE) -C examples/thermostat run

clean:
	$(MAKE) -C tests clean
	$(MAKE) -C bsp/esp32 clean
	$(MAKE) -C examples/thermostat clean
