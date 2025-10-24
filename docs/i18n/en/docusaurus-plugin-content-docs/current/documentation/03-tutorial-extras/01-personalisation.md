# Customization

Customization of the application name, logo, and colors is done directly in the file:  
`frontend/public/branding/theme.yaml`

This file centralizes branding settings and is linked to several parts of the code to automatically apply changes throughout the application.

## 1. Where to configure branding?
- **Main file**: `frontend/public/branding/theme.yaml`
  - You define the application name, logo, main colors, etc.
  - Example:
    ```yaml
    appName: "OctoCast"
    logo: "/branding/ochoIconFull.svg"
    color_var1: "#123456"
    color_var2: "#abcdef"
    ```

## 2. Typing and integration
- The schema of this YAML file is defined in:  
  `frontend/src/branding/type.ts`  
  (e.g.: interface or type `BrandingConfig`)
- This ensures that YAML properties are properly typed and validated in the code.

## 3. Usage in components
- **Header**:  
  The main header component (`frontend/src/components/ReworkComponents/generic/Header/header.tsx`) uses branding values to display the name, logo, and apply colors.
- **BrandingContext**:  
  The React context `frontend/src/brandingContext.tsx` loads and provides branding to the entire application.
- **useBranding Hook**:  
  The hook `frontend/src/hooks/useBranding.ts` allows easy access to branding values in any React component.
- **Global application**:  
  Branding is applied from the root component `frontend/src/App.tsx` to ensure the entire UI is consistent.

## 4. How does it work?
1. At startup, the `BrandingContext` context loads the `theme.yaml` file.
2. Values are typed via `type.ts` and accessible via the `useBranding` hook.
3. Components (like the Header) consume these values to display the name, logo, and apply colors.
4. Any modification in `theme.yaml` is automatically propagated to the UI after a refresh.

## 5. Modification example
- To change the name, logo, or a color, simply modify `theme.yaml`:
  ```yaml
  appName: "MySuperApp"
  logo: "/branding/mylogo.svg"
  color_var1: "#ff6600"
  ```
- Restart the frontend if needed to see the changes.

---

**Summary:**
- All branding is configured in `theme.yaml`.
- Typing is ensured by `type.ts`.
- The context, hook, and components consume these values to dynamically display branding throughout the application.