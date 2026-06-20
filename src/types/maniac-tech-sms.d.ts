/**
 * @maniac-tech/react-native-expo-read-sms ships no TypeScript types.
 * These declarations are written from the package's actual installed
 * JS source (v9.1.2), not its README (which documents an inaccurate
 * two-callback signature for startReadSMS) — see src/hooks/useSmsListener.ts
 * for the discrepancy notes.
 */
declare module "@maniac-tech/react-native-expo-read-sms" {
  export interface SmsPermissionStatus {
    hasReceiveSmsPermission: boolean;
    hasReadSmsPermission: boolean;
  }

  export function checkIfHasSMSPermission(): Promise<SmsPermissionStatus>;
  export function requestReadSMSPermission(): Promise<boolean>;

  /**
   * Single callback receives (status, sms, error). `sms` shape is not
   * verifiable from JS alone (native-side dependent) — treat as unknown
   * and parse defensively, see useSmsListener.ts.
   */
  export function startReadSMS(
    callback: (status: "success" | "error", sms: string, error?: unknown) => void
  ): Promise<void>;

  export function stopReadSMS(): void;
}
