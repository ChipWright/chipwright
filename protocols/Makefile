# Aggregate targets for the protocol layer.

.PHONY: test example clean

test:
	$(MAKE) -C tests run

example:
	$(MAKE) -C examples/commission_thermostat run

clean:
	$(MAKE) -C tests clean
	$(MAKE) -C examples/commission_thermostat clean
