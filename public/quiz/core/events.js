export const createEventBus = () => {
  const listeners = new Set();

  const emit = (event) => {
    listeners.forEach((listener) => listener(event));
  };

  const on = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
  };

  return { emit, on };
};
