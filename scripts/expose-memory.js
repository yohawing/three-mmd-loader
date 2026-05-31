Module["HEAPU8"] = HEAPU8;
Module["HEAPU16"] = HEAPU16;
Module["HEAP32"] = HEAP32;
Module["HEAPU32"] = HEAPU32;
Module["HEAPF32"] = HEAPF32;
Module["refreshMemoryViews"] = () => {
  Module["HEAPU8"] = HEAPU8;
  Module["HEAPU16"] = HEAPU16;
  Module["HEAP32"] = HEAP32;
  Module["HEAPU32"] = HEAPU32;
  Module["HEAPF32"] = HEAPF32;
};
