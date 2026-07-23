# Aggregate targets for the test framework.

.PHONY: test clean

test:
	$(MAKE) -C suites/thermostat run
	$(MAKE) -C suites/connectivity run
	$(MAKE) -C suites/reliability run

clean:
	$(MAKE) -C suites/thermostat clean
	$(MAKE) -C suites/connectivity clean
	$(MAKE) -C suites/reliability clean
