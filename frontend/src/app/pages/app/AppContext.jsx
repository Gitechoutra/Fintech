import { createContext, useContext } from "react";

/** Shared by every dashboard section: payment-provider config, the Pay Now dialog,
 *  and a version counter that bumps after a payment so sections reload their data. */
export const AppCtx = createContext({ payCfg: null, openPay: () => {}, version: 0, lendersAvailable: false });
export const useApp = () => useContext(AppCtx);
