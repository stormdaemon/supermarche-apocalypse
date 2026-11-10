/** Typed key used to store and retrieve a component on an entity. */
export interface ComponentKey<T> {
  readonly name: string;
  /** Phantom field carrying the component type. */
  readonly __type?: T;
}

export function defineComponent<T>(name: string): ComponentKey<T> {
  return { name };
}

let nextEntityId = 1;

/** A bag of components identified by a unique id. */
export class Entity {
  readonly id = nextEntityId++;
  readonly tags = new Set<string>();
  alive = true;
  private readonly components = new Map<ComponentKey<unknown>, unknown>();

  constructor(public name = 'entity') {}

  add<T>(key: ComponentKey<T>, value: T): this {
    this.components.set(key as ComponentKey<unknown>, value);
    return this;
  }

  get<T>(key: ComponentKey<T>): T | undefined {
    return this.components.get(key as ComponentKey<unknown>) as T | undefined;
  }

  require<T>(key: ComponentKey<T>): T {
    const value = this.get(key);
    if (value === undefined) throw new Error(`Entity ${this.name} has no component ${key.name}`);
    return value;
  }

  has(key: ComponentKey<unknown>): boolean {
    return this.components.has(key);
  }

  remove(key: ComponentKey<unknown>): void {
    this.components.delete(key);
  }
}

/** A unit of logic run by the world on every fixed step and/or every rendered frame. */
export interface System {
  readonly name: string;
  /** Lower runs first. Core systems use 0-100, features should use 100+. */
  readonly priority?: number;
  fixedUpdate?(dt: number): void;
  update?(dt: number, alpha: number): void;
}

/** Holds entities and systems and runs the systems in priority order. */
export class World {
  readonly entities = new Set<Entity>();
  private systems: System[] = [];
  private readonly removeHooks = new Set<(entity: Entity) => void>();

  add(entity: Entity): Entity {
    this.entities.add(entity);
    return entity;
  }

  remove(entity: Entity): void {
    if (!this.entities.has(entity)) return;
    entity.alive = false;
    this.entities.delete(entity);
    for (const hook of this.removeHooks) hook(entity);
  }

  onRemove(hook: (entity: Entity) => void): void {
    this.removeHooks.add(hook);
  }

  *query(...keys: ComponentKey<unknown>[]): IterableIterator<Entity> {
    for (const entity of this.entities) {
      if (keys.every((key) => entity.has(key))) yield entity;
    }
  }

  withTag(tag: string): Entity[] {
    return [...this.entities].filter((entity) => entity.tags.has(tag));
  }

  addSystem(system: System): () => void {
    this.systems.push(system);
    this.systems.sort((a, b) => (a.priority ?? 100) - (b.priority ?? 100));
    return () => {
      this.systems = this.systems.filter((s) => s !== system);
    };
  }

  fixedUpdate(dt: number): void {
    for (const system of this.systems) system.fixedUpdate?.(dt);
  }

  update(dt: number, alpha: number): void {
    for (const system of this.systems) system.update?.(dt, alpha);
  }
}
