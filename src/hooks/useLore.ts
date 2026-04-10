import { useState, useCallback, useRef, useEffect } from 'react';
import { LoreManager } from '../lore/LoreManager';
import type { LoreData } from '../engine/types';

export function useLore() {
  const managerRef = useRef<LoreManager>(new LoreManager());
  const [lore, setLore] = useState<LoreData>(managerRef.current.getLore());
  const [hasLore, setHasLore] = useState(managerRef.current.hasLore());

  useEffect(() => {
    const unsubscribe = managerRef.current.onChange(() => {
      setLore(managerRef.current.getLore());
      setHasLore(managerRef.current.hasLore());
    });
    return unsubscribe;
  }, []);

  const importFile = useCallback(async (file: File) => {
    return managerRef.current.importFromFile(file);
  }, []);

  const exportFile = useCallback(() => {
    managerRef.current.exportToFile();
  }, []);

  const clearAll = useCallback(() => {
    managerRef.current.clearAll();
  }, []);

  const getStats = useCallback(() => {
    return managerRef.current.getStats();
  }, []);

  return {
    lore,
    hasLore,
    manager: managerRef.current,
    importFile,
    exportFile,
    clearAll,
    getStats,
  };
}
