/**
 * Generator Registry - Plugin system for map generators
 */

import type { MapGenerator, GeneratorEntry } from '../types';

export class GeneratorRegistry {
  private generators = new Map<string, GeneratorEntry>();

  register(GeneratorClass: new () => MapGenerator & { constructor: { id: string; label: string; icon: string } }) {
    const instance = new GeneratorClass();
    const ctor = GeneratorClass as unknown as { id: string; label: string; icon: string };
    this.generators.set(ctor.id, {
      id: ctor.id,
      label: ctor.label,
      icon: ctor.icon,
      instance,
      controls: instance.getControls(),
    });
  }

  get(id: string): GeneratorEntry | undefined {
    return this.generators.get(id);
  }

  getAll(): GeneratorEntry[] {
    return Array.from(this.generators.values());
  }
}
