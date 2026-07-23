#ifndef OPENHOME_NATIVE_BSP_H
#define OPENHOME_NATIVE_BSP_H

#include "openhome/sdk.h"

// Board support package that runs on the development host. It supplies simulated
// drivers so firmware can be built and exercised without physical hardware, and is the
// same seam the digital-twin simulator will drive in Phase 2.
oh_status_t oh_native_bsp_register(void);

#endif  // OPENHOME_NATIVE_BSP_H
