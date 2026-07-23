# Aggregate targets for the simulator.

.PHONY: test example clean

test:
	$(MAKE) -C tests run

example:
	$(MAKE) -C examples/thermostat_twin run

clean:
	$(MAKE) -C tests clean
	$(MAKE) -C examples/thermostat_twin clean
