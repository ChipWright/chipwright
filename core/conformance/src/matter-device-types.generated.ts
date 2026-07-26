// GENERATED FILE - do not edit by hand.
// Produced by scripts/generate-matter-device-types.ts from the Matter Device Library
// (connectedhomeip data_model 1.4). Regenerate rather than editing.

export type ClusterConformance = "mandatory" | "optional";

export interface MatterDeviceTypeCluster {
  id: number;
  name: string;
  conformance: ClusterConformance;
}

export interface MatterDeviceType {
  id: number;
  name: string;
  revision: number;
  serverClusters: MatterDeviceTypeCluster[];
}

export const MATTER_DATA_MODEL_VERSION = "1.4";

export const MATTER_DEVICE_TYPES: Record<number, MatterDeviceType> = {
  0x000a: {
    id: 0x000a,
    name: "Door Lock",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0101, name: "Door Lock", conformance: "mandatory" },
    ],
  },
  0x000b: {
    id: 0x000b,
    name: "Door Lock Controller",
    revision: 3,
    serverClusters: [
      { id: 0x0038, name: "Time Synchronization", conformance: "optional" },
    ],
  },
  0x000e: {
    id: 0x000e,
    name: "Aggregator",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0025, name: "Actions", conformance: "optional" },
      { id: 0x0751, name: "Commissioner Control", conformance: "optional" },
    ],
  },
  0x000f: {
    id: 0x000f,
    name: "Generic Switch",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x003b, name: "Switch", conformance: "mandatory" },
    ],
  },
  0x0011: {
    id: 0x0011,
    name: "Power Source",
    revision: 1,
    serverClusters: [
      { id: 0x002f, name: "Power Source", conformance: "mandatory" },
    ],
  },
  0x0012: {
    id: 0x0012,
    name: "OTA Requestor",
    revision: 1,
    serverClusters: [
      { id: 0x002a, name: "OTA Software Update Requestor", conformance: "mandatory" },
    ],
  },
  0x0013: {
    id: 0x0013,
    name: "Bridged Node",
    revision: 3,
    serverClusters: [
      { id: 0x002f, name: "Power Source", conformance: "optional" },
      { id: 0x0039, name: "Bridged Device Basic Information", conformance: "mandatory" },
      { id: 0x003c, name: "Administrator Commissioning", conformance: "optional" },
      { id: 0x0750, name: "Ecosystem Information", conformance: "optional" },
    ],
  },
  0x0014: {
    id: 0x0014,
    name: "OTA Provider",
    revision: 1,
    serverClusters: [
      { id: 0x0029, name: "OTA Software Update Provider", conformance: "mandatory" },
    ],
  },
  0x0015: {
    id: 0x0015,
    name: "Contact Sensor",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0045, name: "Boolean State", conformance: "mandatory" },
      { id: 0x0080, name: "Boolean State Configuration", conformance: "optional" },
    ],
  },
  0x0016: {
    id: 0x0016,
    name: "Root Node",
    revision: 3,
    serverClusters: [
      { id: 0x001f, name: "Access Control", conformance: "mandatory" },
      { id: 0x0028, name: "Basic Information", conformance: "mandatory" },
      { id: 0x002b, name: "Localization Configuration", conformance: "optional" },
      { id: 0x002c, name: "Time Format Localization", conformance: "optional" },
      { id: 0x002d, name: "Unit Localization", conformance: "optional" },
      { id: 0x0030, name: "General Commissioning", conformance: "mandatory" },
      { id: 0x0031, name: "Network Commissioning", conformance: "optional" },
      { id: 0x0032, name: "Diagnostic Logs", conformance: "optional" },
      { id: 0x0033, name: "General Diagnostics", conformance: "mandatory" },
      { id: 0x0034, name: "Software Diagnostics", conformance: "optional" },
      { id: 0x0035, name: "Thread Network Diagnostics", conformance: "optional" },
      { id: 0x0036, name: "Wi-Fi Network Diagnostics", conformance: "optional" },
      { id: 0x0037, name: "Ethernet Network Diagnostics", conformance: "optional" },
      { id: 0x0038, name: "Time Synchronization", conformance: "optional" },
      { id: 0x003c, name: "Administrator Commissioning", conformance: "mandatory" },
      { id: 0x003e, name: "Node Operational Credentials", conformance: "mandatory" },
      { id: 0x003f, name: "Group Key Management", conformance: "mandatory" },
      { id: 0x0046, name: "ICD Management", conformance: "optional" },
    ],
  },
  0x0017: {
    id: 0x0017,
    name: "Solar Power",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
    ],
  },
  0x0018: {
    id: 0x0018,
    name: "Battery Storage",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
    ],
  },
  0x0019: {
    id: 0x0019,
    name: "Secondary Network Interface",
    revision: 1,
    serverClusters: [
      { id: 0x0031, name: "Network Commissioning", conformance: "mandatory" },
      { id: 0x0035, name: "Thread Network Diagnostics", conformance: "optional" },
      { id: 0x0036, name: "Wi-Fi Network Diagnostics", conformance: "optional" },
      { id: 0x0037, name: "Ethernet Network Diagnostics", conformance: "optional" },
    ],
  },
  0x0022: {
    id: 0x0022,
    name: "Speaker",
    revision: 1,
    serverClusters: [
      { id: 0x0006, name: "OnOff", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "mandatory" },
    ],
  },
  0x0023: {
    id: 0x0023,
    name: "Casting Video Player",
    revision: 2,
    serverClusters: [
      { id: 0x0006, name: "OnOff", conformance: "mandatory" },
      { id: 0x0097, name: "Messages", conformance: "optional" },
      { id: 0x0503, name: "WakeOnLAN", conformance: "optional" },
      { id: 0x0504, name: "Channel", conformance: "optional" },
      { id: 0x0505, name: "Target Navigator", conformance: "optional" },
      { id: 0x0506, name: "Media Playback", conformance: "mandatory" },
      { id: 0x0507, name: "Media Input", conformance: "optional" },
      { id: 0x0508, name: "Low Power", conformance: "optional" },
      { id: 0x0509, name: "Keypad Input", conformance: "mandatory" },
      { id: 0x050a, name: "Content Launcher", conformance: "mandatory" },
      { id: 0x050b, name: "Audio Output", conformance: "optional" },
      { id: 0x050c, name: "Application Launcher", conformance: "optional" },
      { id: 0x050e, name: "Account Login", conformance: "optional" },
      { id: 0x050f, name: "Content Control", conformance: "optional" },
    ],
  },
  0x0024: {
    id: 0x0024,
    name: "Content App",
    revision: 2,
    serverClusters: [
      { id: 0x001e, name: "Binding", conformance: "optional" },
      { id: 0x0504, name: "Channel", conformance: "optional" },
      { id: 0x0505, name: "Target Navigator", conformance: "optional" },
      { id: 0x0506, name: "Media Playback", conformance: "optional" },
      { id: 0x0509, name: "Keypad Input", conformance: "mandatory" },
      { id: 0x050a, name: "Content Launcher", conformance: "optional" },
      { id: 0x050c, name: "Application Launcher", conformance: "mandatory" },
      { id: 0x050d, name: "Application Basic", conformance: "mandatory" },
      { id: 0x050e, name: "Account Login", conformance: "optional" },
    ],
  },
  0x0027: {
    id: 0x0027,
    name: "Mode Select",
    revision: 1,
    serverClusters: [
      { id: 0x0050, name: "Mode Select", conformance: "mandatory" },
    ],
  },
  0x0028: {
    id: 0x0028,
    name: "Basic Video Player",
    revision: 2,
    serverClusters: [
      { id: 0x0006, name: "OnOff", conformance: "mandatory" },
      { id: 0x0097, name: "Messages", conformance: "optional" },
      { id: 0x0503, name: "WakeOnLAN", conformance: "optional" },
      { id: 0x0504, name: "Channel", conformance: "optional" },
      { id: 0x0505, name: "Target Navigator", conformance: "optional" },
      { id: 0x0506, name: "Media Playback", conformance: "mandatory" },
      { id: 0x0507, name: "Media Input", conformance: "optional" },
      { id: 0x0508, name: "Low Power", conformance: "optional" },
      { id: 0x0509, name: "Keypad Input", conformance: "mandatory" },
      { id: 0x050b, name: "Audio Output", conformance: "optional" },
      { id: 0x050f, name: "Content Control", conformance: "optional" },
    ],
  },
  0x0029: {
    id: 0x0029,
    name: "Casting Video Client",
    revision: 2,
    serverClusters: [
      { id: 0x0510, name: "Content App Observer", conformance: "optional" },
    ],
  },
  0x002a: {
    id: 0x002a,
    name: "Video Remote Control",
    revision: 2,
    serverClusters: [

    ],
  },
  0x002b: {
    id: 0x002b,
    name: "Fan",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "optional" },
      { id: 0x0202, name: "Fan Control", conformance: "mandatory" },
    ],
  },
  0x002c: {
    id: 0x002c,
    name: "Air Quality Sensor",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x005b, name: "Air Quality", conformance: "mandatory" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
      { id: 0x0405, name: "Relative Humidity Measurement", conformance: "optional" },
      { id: 0x040c, name: "Carbon Monoxide Concentration Measurement", conformance: "optional" },
      { id: 0x040d, name: "Carbon Dioxide Concentration Measurement", conformance: "optional" },
      { id: 0x0413, name: "Nitrogen Dioxide Concentration Measurement", conformance: "optional" },
      { id: 0x0415, name: "Ozone Concentration Measurement", conformance: "optional" },
      { id: 0x042a, name: "PM2.5 Concentration Measurement", conformance: "optional" },
      { id: 0x042b, name: "Formaldehyde Concentration Measurement", conformance: "optional" },
      { id: 0x042c, name: "PM1 Concentration Measurement", conformance: "optional" },
      { id: 0x042d, name: "PM10 Concentration Measurement", conformance: "optional" },
      { id: 0x042e, name: "Total Volatile Organic Compounds Concentration Measurement", conformance: "optional" },
      { id: 0x042f, name: "Radon Concentration Measurement", conformance: "optional" },
    ],
  },
  0x002d: {
    id: 0x002d,
    name: "Air Purifier",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "optional" },
      { id: 0x0071, name: "HEPA Filter Monitoring", conformance: "optional" },
      { id: 0x0072, name: "Activated Carbon Filter Monitoring", conformance: "optional" },
      { id: 0x0202, name: "Fan Control", conformance: "mandatory" },
    ],
  },
  0x0041: {
    id: 0x0041,
    name: "Water Freeze Detector",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0045, name: "Boolean State", conformance: "mandatory" },
      { id: 0x0080, name: "Boolean State Configuration", conformance: "optional" },
    ],
  },
  0x0042: {
    id: 0x0042,
    name: "Water Valve",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0081, name: "Valve Configuration and Control", conformance: "mandatory" },
      { id: 0x0404, name: "Flow Measurement", conformance: "optional" },
    ],
  },
  0x0043: {
    id: 0x0043,
    name: "Water Leak Detector",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0045, name: "Boolean State", conformance: "mandatory" },
      { id: 0x0080, name: "Boolean State Configuration", conformance: "optional" },
    ],
  },
  0x0044: {
    id: 0x0044,
    name: "Rain Sensor",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0045, name: "Boolean State", conformance: "mandatory" },
      { id: 0x0080, name: "Boolean State Configuration", conformance: "optional" },
    ],
  },
  0x0070: {
    id: 0x0070,
    name: "Refrigerator",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0052, name: "Refrigerator And Temperature Controlled Cabinet Mode", conformance: "optional" },
      { id: 0x0057, name: "Refrigerator Alarm", conformance: "optional" },
    ],
  },
  0x0071: {
    id: 0x0071,
    name: "Temperature Controlled Cabinet",
    revision: 3,
    serverClusters: [
      { id: 0x0048, name: "Oven Cavity Operational State", conformance: "optional" },
      { id: 0x0049, name: "Oven Mode", conformance: "optional" },
      { id: 0x0052, name: "Refrigerator and Temperature Controlled Cabinet Mode", conformance: "optional" },
      { id: 0x0056, name: "Temperature Control", conformance: "mandatory" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
    ],
  },
  0x0072: {
    id: 0x0072,
    name: "Room Air Conditioner",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0062, name: "Scenes Management", conformance: "optional" },
      { id: 0x0201, name: "Thermostat", conformance: "mandatory" },
      { id: 0x0202, name: "Fan Control", conformance: "optional" },
      { id: 0x0204, name: "Thermostat User Interface Configuration", conformance: "optional" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
      { id: 0x0405, name: "Relative Humidity Measurement", conformance: "optional" },
    ],
  },
  0x0073: {
    id: 0x0073,
    name: "Laundry Washer",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "optional" },
      { id: 0x0051, name: "Laundry Washer Mode", conformance: "optional" },
      { id: 0x0053, name: "Laundry Washer Controls", conformance: "optional" },
      { id: 0x0056, name: "Temperature Control", conformance: "optional" },
      { id: 0x0060, name: "Operational State", conformance: "mandatory" },
    ],
  },
  0x0074: {
    id: 0x0074,
    name: "Robotic Vacuum Cleaner",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0054, name: "RVC Run Mode", conformance: "mandatory" },
      { id: 0x0055, name: "RVC Clean Mode", conformance: "optional" },
      { id: 0x0061, name: "RVC Operational State", conformance: "mandatory" },
      { id: 0x0150, name: "Service Area", conformance: "optional" },
    ],
  },
  0x0075: {
    id: 0x0075,
    name: "Dishwasher",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "optional" },
      { id: 0x0056, name: "Temperature Control", conformance: "optional" },
      { id: 0x0059, name: "Dishwasher Mode", conformance: "optional" },
      { id: 0x005d, name: "Dishwasher Alarm", conformance: "optional" },
      { id: 0x0060, name: "Operational State", conformance: "mandatory" },
    ],
  },
  0x0076: {
    id: 0x0076,
    name: "Smoke CO Alarm",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "optional" },
      { id: 0x005c, name: "Smoke CO Alarm", conformance: "mandatory" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
      { id: 0x0405, name: "Relative Humidity Measurement", conformance: "optional" },
      { id: 0x040c, name: "Carbon Monoxide Concentration Measurement", conformance: "optional" },
    ],
  },
  0x0077: {
    id: 0x0077,
    name: "Cook Surface",
    revision: 1,
    serverClusters: [
      { id: 0x0006, name: "On/Off", conformance: "optional" },
      { id: 0x0056, name: "Temperature Control", conformance: "optional" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
    ],
  },
  0x0078: {
    id: 0x0078,
    name: "Cooktop",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
    ],
  },
  0x0079: {
    id: 0x0079,
    name: "Microwave Oven",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x005e, name: "Microwave Oven Mode", conformance: "mandatory" },
      { id: 0x005f, name: "Microwave Oven Control", conformance: "mandatory" },
      { id: 0x0060, name: "Operational State", conformance: "mandatory" },
      { id: 0x0202, name: "Fan Control", conformance: "optional" },
    ],
  },
  0x007a: {
    id: 0x007a,
    name: "Extractor Hood",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0071, name: "HEPA Filter Monitoring", conformance: "optional" },
      { id: 0x0072, name: "Activated Carbon Filter Monitoring", conformance: "optional" },
      { id: 0x0202, name: "Fan Control", conformance: "mandatory" },
    ],
  },
  0x007b: {
    id: 0x007b,
    name: "Oven",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
    ],
  },
  0x007c: {
    id: 0x007c,
    name: "Laundry Dryer",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "optional" },
      { id: 0x004a, name: "Laundry Dryer Controls", conformance: "optional" },
      { id: 0x0051, name: "Laundry Washer Mode", conformance: "optional" },
      { id: 0x0056, name: "Temperature Control", conformance: "optional" },
      { id: 0x0060, name: "Operational State", conformance: "mandatory" },
    ],
  },
  0x0090: {
    id: 0x0090,
    name: "Network Infrastructure Manager",
    revision: 1,
    serverClusters: [
      { id: 0x0451, name: "Wi-Fi Network Management", conformance: "mandatory" },
      { id: 0x0452, name: "Thread Border Router Management", conformance: "mandatory" },
      { id: 0x0453, name: "Thread Network Directory", conformance: "mandatory" },
    ],
  },
  0x0091: {
    id: 0x0091,
    name: "Thread Border Router",
    revision: 1,
    serverClusters: [
      { id: 0x0035, name: "Thread Network Diagnostics", conformance: "mandatory" },
      { id: 0x0452, name: "Thread Border Router Management", conformance: "mandatory" },
      { id: 0x0453, name: "Thread Network Directory", conformance: "optional" },
    ],
  },
  0x0100: {
    id: 0x0100,
    name: "On/Off Light",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "optional" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
    ],
  },
  0x0101: {
    id: 0x0101,
    name: "Dimmable Light",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "mandatory" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
    ],
  },
  0x0103: {
    id: 0x0103,
    name: "On/Off Light Switch",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
    ],
  },
  0x0104: {
    id: 0x0104,
    name: "Dimmer Switch",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
    ],
  },
  0x0105: {
    id: 0x0105,
    name: "Color Dimmer Switch",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
    ],
  },
  0x0106: {
    id: 0x0106,
    name: "Light Sensor",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0400, name: "Illuminance Measurement", conformance: "mandatory" },
    ],
  },
  0x0107: {
    id: 0x0107,
    name: "Occupancy Sensor",
    revision: 4,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0080, name: "Boolean State Configuration", conformance: "optional" },
      { id: 0x0406, name: "Occupancy Sensing", conformance: "mandatory" },
    ],
  },
  0x010a: {
    id: 0x010a,
    name: "On/Off Plug-in Unit",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "optional" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
    ],
  },
  0x010b: {
    id: 0x010b,
    name: "Dimmable Plug-In Unit",
    revision: 4,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "mandatory" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
    ],
  },
  0x010c: {
    id: 0x010c,
    name: "Color Temperature Light",
    revision: 4,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "mandatory" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
      { id: 0x0300, name: "Color Control", conformance: "mandatory" },
    ],
  },
  0x010d: {
    id: 0x010d,
    name: "Extended Color Light",
    revision: 4,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "mandatory" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
      { id: 0x0300, name: "Color Control", conformance: "mandatory" },
    ],
  },
  0x010f: {
    id: 0x010f,
    name: "Mounted On/Off Control",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "optional" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
    ],
  },
  0x0110: {
    id: 0x0110,
    name: "Mounted Dimmable Load Control",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "mandatory" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "mandatory" },
      { id: 0x0062, name: "Scenes Management", conformance: "mandatory" },
    ],
  },
  0x0130: {
    id: 0x0130,
    name: "Joint Fabric Administrator",
    revision: 1,
    serverClusters: [
      { id: 0x0752, name: "Joint Fabric Datastore", conformance: "mandatory" },
      { id: 0x0753, name: "Joint Fabric PKI", conformance: "mandatory" },
    ],
  },
  0x0202: {
    id: 0x0202,
    name: "Window Covering",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "optional" },
      { id: 0x0102, name: "Window Covering", conformance: "mandatory" },
    ],
  },
  0x0203: {
    id: 0x0203,
    name: "Window Covering Controller",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
    ],
  },
  0x0301: {
    id: 0x0301,
    name: "Thermostat",
    revision: 4,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "optional" },
      { id: 0x009b, name: "Energy Preference", conformance: "optional" },
      { id: 0x0201, name: "Thermostat", conformance: "mandatory" },
      { id: 0x0204, name: "Thermostat User Interface Configuration", conformance: "optional" },
    ],
  },
  0x0302: {
    id: 0x0302,
    name: "Temperature Sensor",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "mandatory" },
    ],
  },
  0x0303: {
    id: 0x0303,
    name: "Pump",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0004, name: "Groups", conformance: "optional" },
      { id: 0x0006, name: "On/Off", conformance: "mandatory" },
      { id: 0x0008, name: "Level Control", conformance: "optional" },
      { id: 0x0062, name: "Scenes Management", conformance: "optional" },
      { id: 0x0200, name: "Pump Configuration and Control", conformance: "mandatory" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
      { id: 0x0403, name: "Pressure Measurement", conformance: "optional" },
      { id: 0x0404, name: "Flow Measurement", conformance: "optional" },
    ],
  },
  0x0304: {
    id: 0x0304,
    name: "Pump Controller",
    revision: 4,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
    ],
  },
  0x0305: {
    id: 0x0305,
    name: "Pressure Sensor",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0403, name: "Pressure Measurement", conformance: "mandatory" },
    ],
  },
  0x0306: {
    id: 0x0306,
    name: "Flow Sensor",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0404, name: "Flow Measurement", conformance: "mandatory" },
    ],
  },
  0x0307: {
    id: 0x0307,
    name: "Humidity Sensor",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
      { id: 0x0405, name: "Relative Humidity Measurement", conformance: "mandatory" },
    ],
  },
  0x0309: {
    id: 0x0309,
    name: "Heat Pump",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
    ],
  },
  0x050c: {
    id: 0x050c,
    name: "Energy EVSE",
    revision: 2,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0099, name: "Energy EVSE", conformance: "mandatory" },
      { id: 0x009d, name: "Energy EVSE Mode", conformance: "mandatory" },
      { id: 0x0402, name: "Temperature Measurement", conformance: "optional" },
    ],
  },
  0x050d: {
    id: 0x050d,
    name: "Device Energy Management",
    revision: 2,
    serverClusters: [
      { id: 0x0098, name: "Device Energy Management", conformance: "mandatory" },
      { id: 0x009f, name: "Device Energy Management Mode", conformance: "optional" },
    ],
  },
  0x050f: {
    id: 0x050f,
    name: "Water Heater",
    revision: 1,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "optional" },
      { id: 0x0094, name: "Water Heater Management", conformance: "mandatory" },
      { id: 0x009e, name: "Water Heater Mode", conformance: "mandatory" },
      { id: 0x0201, name: "Thermostat", conformance: "mandatory" },
    ],
  },
  0x0510: {
    id: 0x0510,
    name: "Electrical Sensor",
    revision: 1,
    serverClusters: [
      { id: 0x0090, name: "Electrical Power Measurement", conformance: "optional" },
      { id: 0x0091, name: "Electrical Energy Measurement", conformance: "optional" },
      { id: 0x009c, name: "Power Topology", conformance: "mandatory" },
    ],
  },
  0x0840: {
    id: 0x0840,
    name: "Control Bridge",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
    ],
  },
  0x0850: {
    id: 0x0850,
    name: "On/Off Sensor",
    revision: 3,
    serverClusters: [
      { id: 0x0003, name: "Identify", conformance: "mandatory" },
    ],
  },
};
