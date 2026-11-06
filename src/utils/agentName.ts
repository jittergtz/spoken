import { useState } from "react";
import { getSettings, useSettingsStore } from "../stores/settingsStore";
import { agentNameDictionaryChanges } from "../helpers/agentNameDictionary";

const AGENT_NAME_KEY = "agentName";
const DEFAULT_AGENT_NAME = "Ducky";

export const getAgentName = (): string => {
  const storedName = localStorage.getItem(AGENT_NAME_KEY);
  return storedName && !/^(?:waddle|spoken|openwhispr|openwhisper|openwhipser)$/i.test(storedName.trim())
    ? storedName
    : DEFAULT_AGENT_NAME;
};

function syncAgentNameToDictionary(newName: string, oldName?: string): void {
  const { add, remove } = agentNameDictionaryChanges(
    getSettings().customDictionary,
    newName,
    oldName
  );
  if (add.length === 0 && remove.length === 0) return;

  useSettingsStore.getState().updateCustomDictionary({ add, remove });
}

export const setAgentName = (name: string): void => {
  const oldName = localStorage.getItem(AGENT_NAME_KEY) || "";
  const trimmed = name.trim() || DEFAULT_AGENT_NAME;
  localStorage.setItem(AGENT_NAME_KEY, trimmed);
  syncAgentNameToDictionary(trimmed, oldName);
};

export const ensureAgentNameInDictionary = (): void => {
  const name = getAgentName();
  const storedName = localStorage.getItem(AGENT_NAME_KEY);
  if (storedName && /^(?:waddle|spoken|openwhispr|openwhisper|openwhipser)$/i.test(storedName.trim())) {
    setAgentName(name);
    return;
  }
  if (name) syncAgentNameToDictionary(name);
};

export const useAgentName = () => {
  const [agentName, setAgentNameState] = useState<string>(getAgentName());

  const updateAgentName = (name: string) => {
    setAgentName(name);
    setAgentNameState(name.trim() || DEFAULT_AGENT_NAME);
  };

  return { agentName, setAgentName: updateAgentName };
};
