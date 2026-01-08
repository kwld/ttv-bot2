
import { MemoryPointSystem } from '../../server/services/engine/PointSystem.js';
import { storage } from '../storage';

export class BrowserPointSystem extends MemoryPointSystem {
  private storageKey: string;

  constructor(storageKey: string, defaultData: Record<string, number> = {}) {
    const saved = storage.getItem(storageKey);
    super(saved ? JSON.parse(saved) : defaultData);
    this.storageKey = storageKey;
  }

  persist(): void {
    storage.setItem(this.storageKey, JSON.stringify(this.points));
  }
}
