import { describe, it, expect, beforeEach } from "vitest";

interface PartMetadata {
  serialNumber: string;
  manufacturer: string;
  productionDate: number;
  materialSpec: string;
  status: string;
  lastOwner: string;
  originFactory: string;
}

interface HistoryEvent {
  event: string;
  timestamp: number;
  actor: string;
}

interface MockContract {
  admin: string;
  paused: boolean;
  partCounter: number;
  parts: Map<number, string>;
  metadata: Map<number, PartMetadata>;
  ownership: Map<number, string>;
  history: Map<string, HistoryEvent>;
  historyCounter: Map<number, number>;
  isAdmin(caller: string): boolean;
  setPaused(caller: string, pause: boolean): { value: boolean } | { error: number };
  registerPart(caller: string, serialNumber: string, materialSpec: string, originFactory: string): { value: number } | { error: number };
  transferPart(caller: string, partId: number, newOwner: string): { value: boolean } | { error: number };
  updatePartStatus(caller: string, partId: number, newStatus: string): { value: boolean } | { error: number };
  burnPart(caller: string, partId: number): { value: boolean } | { error: number };
  getPartMetadata(partId: number): { value: PartMetadata } | { error: number };
  getPartOwner(partId: number): { value: string } | { error: number };
  getPartHistory(partId: number, index: number): { value: HistoryEvent } | { error: number };
  getHistoryCount(partId: number): { value: number };
}

const mockContract: MockContract = {
  admin: "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM",
  paused: false,
  partCounter: 0,
  parts: new Map(),
  metadata: new Map(),
  ownership: new Map(),
  history: new Map(),
  historyCounter: new Map(),

  isAdmin(caller: string) {
    return caller === this.admin;
  },

  setPaused(caller: string, pause: boolean) {
    if (!this.isAdmin(caller)) return { error: 100 };
    this.paused = pause;
    return { value: pause };
  },

  registerPart(caller: string, serialNumber: string, materialSpec: string, originFactory: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    if (serialNumber.length === 0 || materialSpec.length === 0 || originFactory.length === 0) return { error: 105 };
    const partId = this.partCounter + 1;
    if (this.metadata.has(partId)) return { error: 101 };
    this.parts.set(partId, caller);
    this.metadata.set(partId, {
      serialNumber,
      manufacturer: caller,
      productionDate: 1000,
      materialSpec,
      status: "active",
      lastOwner: caller,
      originFactory,
    });
    this.ownership.set(partId, caller);
    this.history.set(`${partId}-1`, { event: "registered", timestamp: 1000, actor: caller });
    this.historyCounter.set(partId, 1);
    this.partCounter = partId;
    return { value: partId };
  },

  transferPart(caller: string, partId: number, newOwner: string) {
    if (this.paused) return { error: 103 };
    if (newOwner === "SP000000000000000000002Q6VF78") return { error: 104 };
    const owner = this.ownership.get(partId);
    const metadata = this.metadata.get(partId);
    if (!owner || !metadata) return { error: 102 };
    if (owner !== caller) return { error: 106 };
    if (metadata.status === "recycled") return { error: 107 };
    this.ownership.set(partId, newOwner);
    this.metadata.set(partId, { ...metadata, lastOwner: newOwner });
    const historyIndex = (this.historyCounter.get(partId) || 0) + 1;
    this.history.set(`${partId}-${historyIndex}`, { event: "transferred", timestamp: 1000, actor: caller });
    this.historyCounter.set(partId, historyIndex);
    return { value: true };
  },

  updatePartStatus(caller: string, partId: number, newStatus: string) {
    if (!this.isAdmin(caller)) return { error: 100 };
    const metadata = this.metadata.get(partId);
    if (!metadata) return { error: 102 };
    if (metadata.status === "recycled") return { error: 107 };
    this.metadata.set(partId, { ...metadata, status: newStatus });
    const historyIndex = (this.historyCounter.get(partId) || 0) + 1;
    this.history.set(`${partId}-${historyIndex}`, { event: `status-updated-${newStatus}`, timestamp: 1000, actor: caller });
    this.historyCounter.set(partId, historyIndex);
    return { value: true };
  },

  burnPart(caller: string, partId: number) {
    if (!this.isAdmin(caller)) return { error: 100 };
    const owner = this.ownership.get(partId);
    const metadata = this.metadata.get(partId);
    if (!owner || !metadata) return { error: 102 };
    if (owner !== caller) return { error: 106 };
    if (metadata.status === "recycled") return { error: 107 };
    this.parts.delete(partId);
    this.metadata.set(partId, { ...metadata, status: "recycled" });
    const historyIndex = (this.historyCounter.get(partId) || 0) + 1;
    this.history.set(`${partId}-${historyIndex}`, { event: "burned", timestamp: 1000, actor: caller });
    this.historyCounter.set(partId, historyIndex);
    return { value: true };
  },

  getPartMetadata(partId: number) {
    const metadata = this.metadata.get(partId);
    return metadata ? { value: metadata } : { error: 102 };
  },

  getPartOwner(partId: number) {
    const owner = this.ownership.get(partId);
    return owner ? { value: owner } : { error: 102 };
  },

  getPartHistory(partId: number, index: number) {
    const history = this.history.get(`${partId}-${index}`);
    return history ? { value: history } : { error: 102 };
  },

  getHistoryCount(partId: number) {
    return { value: this.historyCounter.get(partId) || 0 };
  },
};

describe("AutoProof Parts Registry Contract", () => {
  beforeEach(() => {
    mockContract.admin = "ST1PQHQKV0RJXZFY1DGX8MNSNYVE3VGZJSRTPGZGM";
    mockContract.paused = false;
    mockContract.partCounter = 0;
    mockContract.parts = new Map();
    mockContract.metadata = new Map();
    mockContract.ownership = new Map();
    mockContract.history = new Map();
    mockContract.historyCounter = new Map();
  });

  it("should register a new part as NFT by admin", () => {
    const result = mockContract.registerPart(
      mockContract.admin,
      "SN123456",
      "Aluminum-Alloy",
      "FactoryA"
    );
    expect(result).toEqual({ value: 1 });
    expect(mockContract.metadata.get(1)).toEqual({
      serialNumber: "SN123456",
      manufacturer: mockContract.admin,
      productionDate: 1000,
      materialSpec: "Aluminum-Alloy",
      status: "active",
      lastOwner: mockContract.admin,
      originFactory: "FactoryA",
    });
    expect(mockContract.ownership.get(1)).toBe(mockContract.admin);
    expect(mockContract.history.get("1-1")).toEqual({
      event: "registered",
      timestamp: 1000,
      actor: mockContract.admin,
    });
  });

  it("should prevent non-admin from registering parts", () => {
    const result = mockContract.registerPart(
      "ST2CY5...",
      "SN123456",
      "Aluminum-Alloy",
      "FactoryA"
    );
    expect(result).toEqual({ error: 100 });
  });

  it("should prevent registering with invalid metadata", () => {
    const result = mockContract.registerPart(
      mockContract.admin,
      "",
      "Aluminum-Alloy",
      "FactoryA"
    );
    expect(result).toEqual({ error: 105 });
  });

  it("should transfer part ownership", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.transferPart(mockContract.admin, 1, "ST2CY5...");
    expect(result).toEqual({ value: true });
    expect(mockContract.ownership.get(1)).toBe("ST2CY5...");
    expect(mockContract.metadata.get(1)?.lastOwner).toBe("ST2CY5...");
    expect(mockContract.history.get("1-2")).toEqual({
      event: "transferred",
      timestamp: 1000,
      actor: mockContract.admin,
    });
  });

  it("should prevent transfer when paused", () => {
    mockContract.setPaused(mockContract.admin, true);
    const result = mockContract.transferPart(mockContract.admin, 1, "ST2CY5...");
    expect(result).toEqual({ error: 103 });
  });

  it("should update part status by admin", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.updatePartStatus(mockContract.admin, 1, "installed");
    expect(result).toEqual({ value: true });
    expect(mockContract.metadata.get(1)?.status).toBe("installed");
    expect(mockContract.history.get("1-2")).toEqual({
      event: "status-updated-installed",
      timestamp: 1000,
      actor: mockContract.admin,
    });
  });

  it("should burn part by admin", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.burnPart(mockContract.admin, 1);
    expect(result).toEqual({ value: true });
    expect(mockContract.parts.has(1)).toBe(false);
    expect(mockContract.metadata.get(1)?.status).toBe("recycled");
    expect(mockContract.history.get("1-2")).toEqual({
      event: "burned",
      timestamp: 1000,
      actor: mockContract.admin,
    });
  });

  it("should prevent burning already recycled part", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    mockContract.burnPart(mockContract.admin, 1);
    const result = mockContract.burnPart(mockContract.admin, 1);
    expect(result).toEqual({ error: 107 });
  });

  it("should retrieve part metadata", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.getPartMetadata(1);
    expect(result).toEqual({
      value: {
        serialNumber: "SN123456",
        manufacturer: mockContract.admin,
        productionDate: 1000,
        materialSpec: "Aluminum-Alloy",
        status: "active",
        lastOwner: mockContract.admin,
        originFactory: "FactoryA",
      },
    });
  });

  it("should retrieve part owner", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.getPartOwner(1);
    expect(result).toEqual({ value: mockContract.admin });
  });

  it("should retrieve part history", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.getPartHistory(1, 1);
    expect(result).toEqual({
      value: { event: "registered", timestamp: 1000, actor: mockContract.admin },
    });
  });

  it("should retrieve history count", () => {
    mockContract.registerPart(mockContract.admin, "SN123456", "Aluminum-Alloy", "FactoryA");
    const result = mockContract.getHistoryCount(1);
    expect(result).toEqual({ value: 1 });
  });
});