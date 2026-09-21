"""
Classification CLP dynamique basee sur les limites de concentration ECHA.
Utilisee par sds_parser.select_concentration() quand le champ
echa_classification.specific_concentration_limits est non vide.

Retourne None si aucun danger ne s'applique a la concentration donnee
(signal au parser de basculer sur les blocs concentrations manuels).

Copie verbatim de chemlabel_app/chemlabel/echa_classifier.py (V1).
"""

import re

# ÔöÇÔöÇ Classe de danger ÔåÆ (pictogramme GHS, mention d'avertissement) ÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇÔöÇ
HAZARD_CLASS_TO_GHS = {
    "Skin Corr. 1A": ("GHS05", "DANGER"),
    "Skin Corr. 1B": ("GHS05", "DANGER"),
    "Skin Irrit. 2":  ("GHS07", "ATTENTION"),
    "Eye Dam. 1":     ("GHS05", "DANGER"),
    "Eye Irrit. 2":   ("GHS07", "ATTENTION"),
    "Ox. Liq. 1":    ("GHS03", "DANGER"),
    "Ox. Liq. 2":    ("GHS03", "DANGER"),
    "Ox. Liq. 3":    ("GHS03", "ATTENTION"),
    "STOT SE 3":     ("GHS07", "ATTENTION"),
}

# ÔöÇÔöÇ H-codes ÔåÆ phrase francaise (style coherent avec les fiches : sans accents) ÔöÇ
H_PHRASES_FR = {
    "H271": "H271 - Peut provoquer un incendie ou une explosion ; comburant puissant.",
    "H272": "H272 - Peut aggraver un incendie ; comburant.",
    "H290": "H290 - Peut etre corrosif pour les metaux.",
    "H302": "H302 - Nocif en cas d'ingestion.",
    "H314": "H314 - Provoque de graves brulures de la peau et des lesions oculaires.",
    "H315": "H315 - Provoque une irritation cutanee.",
    "H318": "H318 - Risque de lesions oculaires graves.",
    "H319": "H319 - Provoque une severe irritation des yeux.",
    "H331": "H331 - Toxique par inhalation.",
    "H332": "H332 - Nocif par inhalation.",
    "H335": "H335 - Peut irriter les voies respiratoires.",
    "H336": "H336 - Peut provoquer somnolence ou vertiges.",
}

# ÔöÇÔöÇ Classe de danger ÔåÆ conseils de prudence recommandes (style coherent) ÔöÇÔöÇÔöÇÔöÇ
# Quand plusieurs classes s'appliquent, les phrases sont fusionnees
# par ordre de severite decroissante ; les doublons sur le code P sont elimines.
HAZARD_CLASS_TO_P = {
    "Skin Corr. 1A": [
        "P280 - Porter des gants, des vetements et un equipement de protection des yeux.",
        "P301+P330+P331 - EN CAS D'INGESTION : rincer la bouche. NE PAS faire vomir.",
        "P305+P351+P338 - EN CAS DE CONTACT AVEC LES YEUX : rincer avec precaution"
        " a l'eau pendant plusieurs minutes.",
        "P310 - Appeler immediatement un CENTRE ANTIPOISON ou un medecin.",
    ],
    "Skin Corr. 1B": [
        "P280 - Porter des gants, des vetements et un equipement de protection des yeux.",
        "P301+P330+P331 - EN CAS D'INGESTION : rincer la bouche. NE PAS faire vomir.",
        "P305+P351+P338 - EN CAS DE CONTACT AVEC LES YEUX : rincer avec precaution"
        " a l'eau pendant plusieurs minutes.",
        "P310 - Appeler immediatement un CENTRE ANTIPOISON ou un medecin.",
    ],
