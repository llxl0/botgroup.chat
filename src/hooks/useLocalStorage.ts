import { useState, useEffect } from 'react';

/**
 * 自定义 Hook 用于管理 localStorage 数据
 * @param key localStorage 的键名
 * @param initialValue 初始值
 * @returns [value, setValue] 状态值和设置函数
 */
export function useLocalStorage<T>(key: string, initialValue: T) {
  // 从 localStorage 获取初始值
  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      // 尝试从 localStorage 获取值
      const item = window.localStorage.getItem(key);
      // 如果存在则解析，否则返回初始值
      return item ? JSON.parse(item) : initialValue;
    } catch (error) {
      // 如果出错则返回初始值
      console.error(`Error loading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // 包装的 setValue 函数，同时更新 state 和 localStorage
  const setValue = (value: T | ((val: T) => T)) => {
    try {
      // 允许 value 是一个函数
      const valueToStore =
        value instanceof Function ? value(storedValue) : value;
      // 保存到 state
      setStoredValue(valueToStore);
      // 保存到 localStorage
      window.localStorage.setItem(key, JSON.stringify(valueToStore));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
    }
  };

  // 清除存储的数据
  const clearValue = () => {
    try {
      window.localStorage.removeItem(key);
      setStoredValue(initialValue);
    } catch (error) {
      console.error(`Error clearing localStorage key "${key}":`, error);
    }
  };

  // 监听其他标签页的 storage 事件
  useEffect(() => {
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === key && e.newValue !== null) {
        try {
          setStoredValue(JSON.parse(e.newValue));
        } catch (error) {
          console.error(`Error parsing storage event for key "${key}":`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [key]);

  return [storedValue, setValue, clearValue] as const;
}