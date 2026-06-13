function classifyUrl(url, guardrailConfig) {
  const spamDomains = guardrailConfig?.spam_domains || [];
  const trustedDomains = guardrailConfig?.trusted_domains || [];

  for (const domain of spamDomains) {
    if (url.includes(domain)) {
      return 'spam';
    }
  }

  for (const domain of trustedDomains) {
    if (url.includes(domain)) {
      return 'trusted';
    }
  }

  return 'unknown';
}

export function lookupUrlTrust(input, { guardrailConfig }) {
  const urls = Array.isArray(input?.urls) ? input.urls : [];
  return {
    results: urls.map((url) => ({
      url,
      trust: classifyUrl(url, guardrailConfig),
    })),
  };
}
