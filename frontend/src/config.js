
export const NETWORK = {
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcUrl: "https://soroban-testnet.stellar.org",
  horizonUrl: "https://horizon-testnet.stellar.org",
};

export const CONTRACTS = {
  operatorRegistry: import.meta.env.VITE_REGISTRY_CONTRACT_ID || "CBLJAOBD74WG75D5TOCVEIHQ7CTVU7DCJEEA5YGVFQ6MMCMFI6ME72OZ",
  fareToken: import.meta.env.VITE_TOKEN_CONTRACT_ID || "CDZNJOQUQHITXCVO3XYKEUG5PSC5H56DFXNUB5VQT7PYVMG6N4QX3E35",
  transitController: import.meta.env.VITE_CONTROLLER_CONTRACT_ID || "CATTPBDRTCJTKB4YWT3CCCBGG2SI7QQ2CCOQTJY5WKKGKQEEGJM7SCRR",
};


export const OPERATORS = [
  { id: "DL_METRO", label: "Delhi Metro" },
  { id: "MUM_METRO", label: "Mumbai Metro" },
  { id: "BEST_BUS", label: "BEST Bus" },
];

export const STATIONS = {
  DL_METRO: [
    "RAJIV_CHK",
    "HUDA_CITY",
    "KASHMERE_G",
    "NEW_DELHI",
    "CHANDNI_CHK",
    "CENTRAL_SEC",
    "VISHWAVIDY",
    "GTB_NAGAR",
    "AIIMS",
    "SAKET",
    "QUTAB_MINAR",
    "CHHATARPUR",
  ],
  MUM_METRO: [
    "ANDHERI",
    "VERSOVA",
    "DN_NAGAR",
    "AZAD_NAGAR",
    "CHURCHGT",
    "GHATKOPAR",
    "MALAD",
    "WESTERN_EXP",
    "CHAKALA",
    "MAROL_NAKA",
    "SAKI_NAKA",
    "ASALPHA",
  ],
  BEST_BUS: [
    "DADAR",
    "BANDRA",
    "COLABA",
    "WORLI",
    "MAHIM",
    "KURLA",
    "CHEMBUR",
    "VIKHROLI",
    "THANE",
    "BORIVALI",
    "KANDIVALI",
    "GOREGAON",
  ],
};
