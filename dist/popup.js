"use strict";
(() => {
  // src/popup.ts
  document.addEventListener("DOMContentLoaded", () => {
    const profileSelect = document.getElementById("profileSelect");
    const dropdownStrategySelect = document.getElementById("dropdownStrategySelect");
    const autoSubmitToggle = document.getElementById("autoSubmitToggle");
    const dryRunToggle = document.getElementById("dryRunToggle");
    const debugModeToggle = document.getElementById("debugModeToggle");
    const toggleDenylistInput = document.getElementById("toggleDenylistInput");
    const fillBtn = document.getElementById("fillBtn");
    const refreshLearnedBtn = document.getElementById("refreshLearnedBtn");
    const resetLearnedBtn = document.getElementById("resetLearnedBtn");
    const exportConfigBtn = document.getElementById("exportConfigBtn");
    const importConfigBtn = document.getElementById("importConfigBtn");
    const learnedOutput = document.getElementById("learnedOutput");
    const configDataInput = document.getElementById("configDataInput");
    const reportOutput = document.getElementById("reportOutput");
    const DEFAULT_DENYLIST = "none,no,not applicable,prefer not,decline";
    const refreshLearnedAndReport = () => {
      chrome.storage.local.get(["learnedFieldAnswersByForm", "lastAutofillReport"], (result) => {
        learnedOutput.value = JSON.stringify(result.learnedFieldAnswersByForm || {}, null, 2);
        reportOutput.value = JSON.stringify(result.lastAutofillReport || {}, null, 2);
      });
    };
    chrome.storage.local.get([
      "selectedProfile",
      "selectedDropdownStrategy",
      "selectedAutoSubmit",
      "selectedDryRun",
      "selectedDebugMode",
      "selectedToggleDenylist"
    ], (result) => {
      if (result.selectedProfile) {
        profileSelect.value = result.selectedProfile;
      }
      if (result.selectedDropdownStrategy) {
        dropdownStrategySelect.value = result.selectedDropdownStrategy;
      }
      autoSubmitToggle.checked = Boolean(result.selectedAutoSubmit);
      dryRunToggle.checked = Boolean(result.selectedDryRun);
      debugModeToggle.checked = Boolean(result.selectedDebugMode);
      toggleDenylistInput.value = result.selectedToggleDenylist || DEFAULT_DENYLIST;
    });
    refreshLearnedAndReport();
    profileSelect.addEventListener("change", (e) => {
      const target = e.target;
      chrome.storage.local.set({ selectedProfile: target.value });
    });
    dropdownStrategySelect.addEventListener("change", (e) => {
      const target = e.target;
      chrome.storage.local.set({ selectedDropdownStrategy: target.value });
    });
    autoSubmitToggle.addEventListener("change", () => {
      chrome.storage.local.set({ selectedAutoSubmit: autoSubmitToggle.checked });
    });
    dryRunToggle.addEventListener("change", () => {
      chrome.storage.local.set({ selectedDryRun: dryRunToggle.checked });
    });
    debugModeToggle.addEventListener("change", () => {
      chrome.storage.local.set({ selectedDebugMode: debugModeToggle.checked });
    });
    toggleDenylistInput.addEventListener("blur", () => {
      chrome.storage.local.set({ selectedToggleDenylist: toggleDenylistInput.value || DEFAULT_DENYLIST });
    });
    fillBtn.addEventListener("click", () => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTab = tabs[0];
        if (activeTab && activeTab.id) {
          chrome.tabs.sendMessage(activeTab.id, {
            action: "FILL_FORM",
            profileType: profileSelect.value,
            dropdownStrategy: dropdownStrategySelect.value,
            autoSubmit: autoSubmitToggle.checked,
            dryRun: dryRunToggle.checked,
            debugMode: debugModeToggle.checked,
            toggleDenylist: toggleDenylistInput.value || DEFAULT_DENYLIST
          }, () => {
            refreshLearnedAndReport();
          });
        }
      });
    });
    refreshLearnedBtn.addEventListener("click", () => refreshLearnedAndReport());
    resetLearnedBtn.addEventListener("click", () => {
      chrome.storage.local.set({ learnedFieldAnswersByForm: {} }, () => refreshLearnedAndReport());
    });
    exportConfigBtn.addEventListener("click", () => {
      chrome.storage.local.get(null, (all) => {
        const payload = {
          selectedProfile: all.selectedProfile,
          selectedFormType: all.selectedFormType,
          selectedDropdownStrategy: all.selectedDropdownStrategy,
          selectedAutoSubmit: all.selectedAutoSubmit,
          selectedDryRun: all.selectedDryRun,
          selectedDebugMode: all.selectedDebugMode,
          selectedToggleDenylist: all.selectedToggleDenylist,
          autoPopupHosts: all.autoPopupHosts,
          learnedFieldAnswersByForm: all.learnedFieldAnswersByForm
        };
        configDataInput.value = JSON.stringify(payload, null, 2);
      });
    });
    importConfigBtn.addEventListener("click", () => {
      try {
        const parsed = JSON.parse(configDataInput.value || "{}");
        chrome.storage.local.set(parsed, () => {
          refreshLearnedAndReport();
        });
      } catch (error) {
        reportOutput.value = `Import error: ${error.message}`;
      }
    });
  });
})();
