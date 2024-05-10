import { writable } from 'svelte/store';
import type { Writable } from 'svelte/store';
import { browser } from '$app/environment';

export function localStore<T>(id: string, defaultData: T) {
  if (browser) {
    const existingValue = localStorage.getItem(id);
    if (existingValue) defaultData = JSON.parse(existingValue);
  }

  let store: Writable<T> = writable(defaultData);

  store.subscribe((newValue: T) => {
    browser && localStorage.setItem(id, JSON.stringify(newValue));
  });

  return store;
}
