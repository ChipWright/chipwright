#ifndef CHIPWRIGHT_NATIVE_BSP_H
#define CHIPWRIGHT_NATIVE_BSP_H

#include "chipwright/sdk.h"

// Board support package that runs on the development host. It supplies simulated
// drivers so firmware can be built and exercised without physical hardware, and is the
// same seam the digital-twin simulator will drive in Phase 2.
cw_status_t cw_native_bsp_register(void);

#endif  // CHIPWRIGHT_NATIVE_BSP_H
