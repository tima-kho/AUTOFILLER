"use strict";
(() => {
  // src/background.ts
  chrome.commands.onCommand.addListener((command) => {
    if (command === "autofill_form") {
      console.log("Keyboard shortcut triggered for autofill");
      chrome.storage.local.get([
        "selectedProfile",
        "selectedFormType",
        "selectedDropdownStrategy",
        "selectedAutoSubmit",
        "selectedDryRun",
        "selectedDebugMode",
        "selectedToggleDenylist",
        "selectedFieldOverrides"
      ], (result) => {
        const profile = result.selectedProfile || "random";
        const formType = result.selectedFormType || "general";
        const dropdownStrategy = result.selectedDropdownStrategy || "first";
        const autoSubmit = Boolean(result.selectedAutoSubmit);
        const dryRun = Boolean(result.selectedDryRun);
        const debugMode = Boolean(result.selectedDebugMode);
        const toggleDenylist = result.selectedToggleDenylist || "none,no,not applicable,prefer not,decline";
        const fieldOverrides = result.selectedFieldOverrides && typeof result.selectedFieldOverrides === "object" ? result.selectedFieldOverrides : {};
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
          const activeTab = tabs[0];
          if (activeTab && activeTab.id) {
            chrome.tabs.sendMessage(activeTab.id, {
              action: "FILL_FORM",
              profileType: profile,
              formType,
              dropdownStrategy,
              autoSubmit,
              dryRun,
              debugMode,
              toggleDenylist,
              fieldOverrides
            });
          }
        });
      });
    }
  });
})();
