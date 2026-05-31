import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export interface Collection {
  id: string;
  name: string;
  gameIds: string[];
}

interface CollectionsContextValue {
  collections: Collection[];
  create: (name: string) => Collection | null;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  toggleGame: (id: string, gameId: string) => void;
  isInCollection: (id: string, gameId: string) => boolean;
  collectionsForGame: (gameId: string) => Collection[];
}

const STORAGE_KEY = "dsync.collections";

const makeId = (): string => {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {
    /* fall through */
  }
  return `c_${Date.now().toString(36)}_${Math.floor(Math.random() * 1e6).toString(36)}`;
};

const read = (): Collection[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Collection[]) : [];
  } catch {
    return [];
  }
};

const CollectionsContext = createContext<CollectionsContextValue | null>(null);

export const CollectionsProvider = ({ children }: { children: ReactNode }) => {
  const [collections, setCollections] = useState<Collection[]>(read);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(collections));
    } catch {
      /* ignore quota errors */
    }
  }, [collections]);

  const create = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return null;
    const collection: Collection = { id: makeId(), name: trimmed, gameIds: [] };
    setCollections((prev) => [...prev, collection]);
    return collection;
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCollections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, name: trimmed } : c)),
    );
  }, []);

  const remove = useCallback((id: string) => {
    setCollections((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const toggleGame = useCallback((id: string, gameId: string) => {
    setCollections((prev) =>
      prev.map((c) =>
        c.id !== id
          ? c
          : {
              ...c,
              gameIds: c.gameIds.includes(gameId)
                ? c.gameIds.filter((g) => g !== gameId)
                : [...c.gameIds, gameId],
            },
      ),
    );
  }, []);

  const isInCollection = useCallback(
    (id: string, gameId: string) =>
      collections.find((c) => c.id === id)?.gameIds.includes(gameId) ?? false,
    [collections],
  );

  const collectionsForGame = useCallback(
    (gameId: string) => collections.filter((c) => c.gameIds.includes(gameId)),
    [collections],
  );

  const value: CollectionsContextValue = {
    collections,
    create,
    rename,
    remove,
    toggleGame,
    isInCollection,
    collectionsForGame,
  };

  return (
    <CollectionsContext.Provider value={value}>{children}</CollectionsContext.Provider>
  );
};

export const useCollections = (): CollectionsContextValue => {
  const ctx = useContext(CollectionsContext);
  if (!ctx) throw new Error("useCollections must be used within a CollectionsProvider");
  return ctx;
};
