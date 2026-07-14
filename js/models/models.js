// Generated from js/models/*.json by scripts/build-models.js. Do not edit by hand.
(function (root) {
  "use strict";
  const NS = root.BPS || (root.BPS = {});
  NS.models = [
{
  "schemaVersion": "1.3",
  "id": "mapk",
  "name": "MAPK/ERK cascade with negative feedback",
  "citation": {
    "text": "Kholodenko BN. Negative feedback and ultrasensitivity can bring about oscillations in the mitogen-activated protein kinase cascades. Eur J Biochem 2000;267:1583-1588.",
    "doi": "10.1046/j.1432-1327.2000.01197.x"
  },
  "units": {
    "concentration": "nM",
    "time": "s"
  },
  "species": [
    {
      "id": "MKKK",
      "name": "Raf-1 proto-oncogene, serine/threonine kinase",
      "initial": 90,
      "plot": false,
      "gene": "RAF1",
      "ncbiGene": "5894"
    },
    {
      "id": "MKKKp",
      "name": "Raf-1 proto-oncogene, serine/threonine kinase (P)",
      "initial": 10,
      "plot": false,
      "gene": "RAF1",
      "ncbiGene": "5894"
    },
    {
      "id": "MKK",
      "name": "mitogen-activated protein kinase kinase 1",
      "initial": 280,
      "plot": false,
      "gene": "MAP2K1",
      "ncbiGene": "5604"
    },
    {
      "id": "MKKp",
      "name": "mitogen-activated protein kinase kinase 1 (P)",
      "initial": 10,
      "plot": false,
      "gene": "MAP2K1",
      "ncbiGene": "5604"
    },
    {
      "id": "MKKpp",
      "name": "mitogen-activated protein kinase kinase 1 (PP)",
      "initial": 10,
      "plot": false,
      "gene": "MAP2K1",
      "ncbiGene": "5604"
    },
    {
      "id": "MAPK",
      "name": "mitogen-activated protein kinase 1",
      "initial": 280,
      "plot": false,
      "gene": "MAPK1",
      "ncbiGene": "5594"
    },
    {
      "id": "MAPKp",
      "name": "mitogen-activated protein kinase 1 (P)",
      "initial": 10,
      "plot": false,
      "gene": "MAPK1",
      "ncbiGene": "5594"
    },
    {
      "id": "MAPKpp",
      "name": "mitogen-activated protein kinase 1 (PP, active ERK)",
      "initial": 10,
      "plot": true,
      "gene": "MAPK1",
      "ncbiGene": "5594"
    }
  ],
  "parameters": [
    {
      "id": "stimulus",
      "name": "Stimulus (V1)",
      "value": 2.5,
      "min": 0,
      "max": 5,
      "scale": "linear",
      "unit": "nM/s"
    },
    {
      "id": "fbKi",
      "name": "Feedback Ki",
      "value": 9,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "fbN",
      "name": "Cooperativity n",
      "value": 1,
      "min": 1,
      "max": 4,
      "scale": "linear",
      "unit": ""
    },
    {
      "id": "K1",
      "name": "K1",
      "value": 10,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "V2",
      "name": "V2",
      "value": 0.25,
      "min": 0.01,
      "max": 2,
      "scale": "log",
      "unit": "nM/s"
    },
    {
      "id": "K2",
      "name": "K2",
      "value": 8,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "k3",
      "name": "k3",
      "value": 0.025,
      "min": 0.001,
      "max": 0.5,
      "scale": "log",
      "unit": "1/s"
    },
    {
      "id": "K3",
      "name": "K3",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "k4",
      "name": "k4",
      "value": 0.025,
      "min": 0.001,
      "max": 0.5,
      "scale": "log",
      "unit": "1/s"
    },
    {
      "id": "K4",
      "name": "K4",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "V5",
      "name": "V5",
      "value": 0.75,
      "min": 0.01,
      "max": 5,
      "scale": "log",
      "unit": "nM/s"
    },
    {
      "id": "K5",
      "name": "K5",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "V6",
      "name": "V6",
      "value": 0.75,
      "min": 0.01,
      "max": 5,
      "scale": "log",
      "unit": "nM/s"
    },
    {
      "id": "K6",
      "name": "K6",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "k7",
      "name": "k7",
      "value": 0.025,
      "min": 0.001,
      "max": 0.5,
      "scale": "log",
      "unit": "1/s"
    },
    {
      "id": "K7",
      "name": "K7",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "k8",
      "name": "k8",
      "value": 0.025,
      "min": 0.001,
      "max": 0.5,
      "scale": "log",
      "unit": "1/s"
    },
    {
      "id": "K8",
      "name": "K8",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "V9",
      "name": "V9",
      "value": 0.5,
      "min": 0.01,
      "max": 5,
      "scale": "log",
      "unit": "nM/s"
    },
    {
      "id": "K9",
      "name": "K9",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "V10",
      "name": "V10",
      "value": 0.5,
      "min": 0.01,
      "max": 5,
      "scale": "log",
      "unit": "nM/s"
    },
    {
      "id": "K10",
      "name": "K10",
      "value": 15,
      "min": 1,
      "max": 100,
      "scale": "log",
      "unit": "nM"
    },
    {
      "id": "mekDose",
      "name": "MEK inhibitor",
      "value": 0,
      "min": 0,
      "max": 300,
      "scale": "linear",
      "unit": "nM",
      "role": "dose"
    }
  ],
  "reactions": [
    {
      "id": "v1",
      "name": "MKKK activation (feedback)",
      "reactants": {
        "MKKK": 1
      },
      "products": {
        "MKKKp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "stimulus",
        "Km": "K1",
        "modulators": [
          {
            "id": "negFeedback",
            "name": "Negative feedback",
            "source": {
              "species": "MAPKpp"
            },
            "mechanism": "noncompetitive",
            "Ki": "fbKi",
            "n": "fbN"
          }
        ]
      }
    },
    {
      "id": "v2",
      "name": "MKKK-P deactivation",
      "reactants": {
        "MKKKp": 1
      },
      "products": {
        "MKKK": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "V2",
        "Km": "K2"
      }
    },
    {
      "id": "v3",
      "name": "MKK phosphorylation",
      "reactants": {
        "MKK": 1
      },
      "products": {
        "MKKp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "kcat": "k3",
        "Km": "K3",
        "enzyme": "MKKKp"
      }
    },
    {
      "id": "v4",
      "name": "MKK-P phosphorylation",
      "reactants": {
        "MKKp": 1
      },
      "products": {
        "MKKpp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "kcat": "k4",
        "Km": "K4",
        "enzyme": "MKKKp"
      }
    },
    {
      "id": "v5",
      "name": "MKK-PP dephosphorylation",
      "reactants": {
        "MKKpp": 1
      },
      "products": {
        "MKKp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "V5",
        "Km": "K5"
      }
    },
    {
      "id": "v6",
      "name": "MKK-P dephosphorylation",
      "reactants": {
        "MKKp": 1
      },
      "products": {
        "MKK": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "V6",
        "Km": "K6"
      }
    },
    {
      "id": "v7",
      "name": "MAPK phosphorylation",
      "reactants": {
        "MAPK": 1
      },
      "products": {
        "MAPKp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "kcat": "k7",
        "Km": "K7",
        "enzyme": "MKKpp"
      }
    },
    {
      "id": "v8",
      "name": "MAPK-P phosphorylation",
      "reactants": {
        "MAPKp": 1
      },
      "products": {
        "MAPKpp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "kcat": "k8",
        "Km": "K8",
        "enzyme": "MKKpp",
        "modulators": [
          {
            "id": "mekInhibitor",
            "name": "MEK inhibitor",
            "source": {
              "parameter": "mekDose"
            },
            "mechanism": "noncompetitive",
            "Ki": 15
          }
        ]
      }
    },
    {
      "id": "v9",
      "name": "MAPK-PP dephosphorylation",
      "reactants": {
        "MAPKpp": 1
      },
      "products": {
        "MAPKp": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "V9",
        "Km": "K9"
      }
    },
    {
      "id": "v10",
      "name": "MAPK-P dephosphorylation",
      "reactants": {
        "MAPKp": 1
      },
      "products": {
        "MAPK": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "V10",
        "Km": "K10"
      }
    }
  ],
  "simulation": {
    "tEnd": 9000,
    "rtol": 0.000001,
    "atol": 1e-9
  }
},
{
  "schemaVersion": "1.3",
  "id": "goldbeter-koshland",
  "name": "Zero-order ultrasensitivity switch",
  "citation": {
    "text": "Goldbeter A, Koshland DE. An amplified sensitivity arising from covalent modification in biological systems. Proc Natl Acad Sci USA 1981;78:6840-6844.",
    "doi": "10.1073/pnas.78.11.6840"
  },
  "units": {
    "concentration": "uM",
    "time": "s"
  },
  "species": [
    {
      "id": "W",
      "name": "Unmodified substrate",
      "initial": 1,
      "plot": false
    },
    {
      "id": "Wstar",
      "name": "Modified substrate",
      "initial": 0,
      "plot": true
    }
  ],
  "parameters": [
    {
      "id": "signal",
      "name": "Signal S (kinase Vmax)",
      "value": 1,
      "min": 0.01,
      "max": 100,
      "scale": "log",
      "unit": "uM/s"
    },
    {
      "id": "Vback",
      "name": "Phosphatase Vmax",
      "value": 1,
      "min": 0.1,
      "max": 10,
      "scale": "log",
      "unit": "uM/s"
    },
    {
      "id": "Km",
      "name": "Km (saturation)",
      "value": 0.01,
      "min": 0.001,
      "max": 2,
      "scale": "log",
      "unit": "uM"
    },
    {
      "id": "kinDose",
      "name": "Kinase inhibitor",
      "value": 0,
      "min": 0,
      "max": 2,
      "scale": "linear",
      "unit": "uM",
      "role": "dose"
    }
  ],
  "reactions": [
    {
      "id": "activate",
      "name": "Modification (kinase)",
      "reactants": {
        "W": 1
      },
      "products": {
        "Wstar": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "signal",
        "Km": "Km",
        "modulators": [
          {
            "id": "kinInhibitor",
            "name": "Kinase inhibitor",
            "source": {
              "parameter": "kinDose"
            },
            "mechanism": "competitive",
            "Ki": 0.05
          }
        ]
      }
    },
    {
      "id": "deactivate",
      "name": "Demodification (phosphatase)",
      "reactants": {
        "Wstar": 1
      },
      "products": {
        "W": 1
      },
      "rateLaw": {
        "type": "michaelis_menten",
        "Vmax": "Vback",
        "Km": "Km"
      }
    }
  ],
  "simulation": {
    "tEnd": 500,
    "rtol": 0.000001,
    "atol": 1e-9
  }
}
  ];
})(typeof globalThis !== "undefined" ? globalThis : this);
