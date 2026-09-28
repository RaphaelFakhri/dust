import { useUserLocale } from "@app/hooks/useUserLocale";
import { useFeatureFlags, useWorkspace } from "@app/lib/auth/AuthContext";
import { i18n, loadCatalog } from "@app/lib/i18n/i18n";
import logger from "@app/logger/logger";
import { DEFAULT_LOCALE } from "@app/types/locale";
import { useEffect } from "react";

/**
 * @cc [owner:sfriquet,label:product] active-locale-follows-user-locale
 * The active UI locale MUST be `DEFAULT_LOCALE` when the `localisation` flag is disabled, and the
 * `userLocale` of `useUserLocale` otherwise.
 */
/**
 * @cc [owner:sfriquet,label:product;react] locale-switch-never-blocks-rendering
 * Rendering MUST NOT wait for the user locale or its catalog: the previously active locale stays
 * active until the new catalog is loaded. A catalog that finishes loading after the resolved locale
 * changed again MUST NOT be activated, and a failed load MUST leave the active locale unchanged.
 */
export function UserLocaleSync() {
  const owner = useWorkspace();
  const { hasFeature } = useFeatureFlags();
  const hasLocalisation = hasFeature("localisation");
  const { userLocale } = useUserLocale({ owner, disabled: !hasLocalisation });
  const locale = hasLocalisation ? userLocale : DEFAULT_LOCALE;

  // Syncs the external Lingui instance and the document language with the resolved locale.
  useEffect(() => {
    let isCurrent = true;
    loadCatalog(locale)
      .then((messages) => {
        if (isCurrent) {
          i18n.loadAndActivate({ locale, messages });
          document.documentElement.lang = locale;
        }
      })
      .catch((error) => {
        logger.error({ error, locale }, "Failed to load the UI locale catalog");
      });
    return () => {
      isCurrent = false;
    };
  }, [locale]);

  return null;
}
