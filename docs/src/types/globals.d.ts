declare global {
  interface Window {
    google: any;
    googleTranslateElementInit?: () => void;
  }
}

// By adding this export, we treat this file as a module.
// This is important to allow augmenting the global scope.
export {};
