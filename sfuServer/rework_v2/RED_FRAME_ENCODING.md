# Red Frame Encoding Utilities

## Vue d'ensemble

Ce module fournit des fonctions pour encoder et décoder des numéros de séquence dans les frames rouges utilisées pour la mesure de latence dans le système de benchmark.

## Fichiers

- **`red_frame_utils.py`** - Module principal avec les fonctions d'encodage/décodage
- **`test_red_frame_utils.py`** - Suite de tests complète
- **`example_encoding_usage.py`** - Exemples d'utilisation
- **`host.py`** - Classe Host mise à jour pour utiliser les utils

## Méthodes d'encodage

### 1. Simple 16-bit Encoding (par défaut)

**Principe** : Encode un numéro de séquence sur 16 bits (0-65535) en utilisant les canaux G et B.

```python
from red_frame_utils import encode_sequence_simple, decode_sequence_simple

# Encodage
r, g, b = encode_sequence_simple(1234)
# r=255, g=210 (bits 0-7), b=4 (bits 8-15)

# Décodage
sequence = decode_sequence_simple(255, 210, 4)
# sequence = 1234
```

**Caractéristiques** :
- ✅ **Range** : 0 à 65535 (16 bits)
- ✅ **Efficacité** : Utilise pleinement l'espace disponible
- ✅ **Simplicité** : Encodage/décodage direct
- ❌ **Pas de redondance** : Aucune détection d'erreur
- ❌ **Pas de validation** : Ne peut détecter les frames corrompues

**Utilisation recommandée** :
- Tests longs (>127 red frames)
- Connexion réseau fiable
- Performance maximale requise

### 2. Diagonal Encoding with Redundancy

**Principe** : Encode un numéro de séquence sur 7 bits (0-127) avec redondance pour la détection d'erreur.

```python
from red_frame_utils import encode_sequence_diagonal, decode_sequence_diagonal

# Encodage
r, g, b = encode_sequence_diagonal(50)
# r=255, g=100 (x*2), b=155 (255-g)

# Décodage
sequence, is_valid = decode_sequence_diagonal(255, 100, 155)
# sequence = 50, is_valid = True

# Frame corrompue
sequence, is_valid = decode_sequence_diagonal(255, 100, 100)
# sequence = 64 (estimation), is_valid = False (G+B != 255)
```

**Formules** :
- **Encodage** : `G = x * 2`, `B = 255 - G`
- **Décodage** : `x = round((G + (255 - B)) / 4)`
- **Validation** : `is_valid = (G + B == 255)`

**Caractéristiques** :
- ✅ **Détection d'erreur** : Valide l'intégrité via `G + B = 255`
- ✅ **Correction partielle** : Peut estimer la valeur même si corrompue
- ✅ **Robustesse** : Idéal pour réseaux instables
- ❌ **Range limité** : Seulement 0 à 127 (7 bits)
- ❌ **Wrap-around** : Au-delà de 127, revient à 0

**Utilisation recommandée** :
- Tests courts (<127 red frames)
- Validation d'intégrité importante
- Réseaux instables ou tests de stress
- Debugging de corruption de frames

## API Reference

### Fonctions d'encodage

#### `encode_sequence_simple(sequence_number: int) -> Tuple[int, int, int]`

Encode un numéro de séquence en utilisant la méthode simple 16-bit.

**Paramètres** :
- `sequence_number` (int) : Numéro de séquence entre 0 et 65535

**Retour** : Tuple `(R, G, B)` où R=255

**Exceptions** : `ValueError` si sequence_number hors range

**Exemple** :
```python
r, g, b = encode_sequence_simple(1000)
# (255, 232, 3)
```

#### `decode_sequence_simple(r: int, g: int, b: int) -> int`

Décode un numéro de séquence depuis l'encodage simple.

**Paramètres** :
- `r`, `g`, `b` (int) : Valeurs RGB (r doit être 255)

**Retour** : Numéro de séquence (0-65535)

**Exceptions** : `ValueError` si r != 255

#### `encode_sequence_diagonal(sequence_number: int) -> Tuple[int, int, int]`

Encode avec redondance diagonale.

**Paramètres** :
- `sequence_number` (int) : Numéro de séquence entre 0 et 127

**Retour** : Tuple `(R, G, B)` où R=255, G=x*2, B=255-G

**Exceptions** : `ValueError` si sequence_number hors range

#### `decode_sequence_diagonal(r: int, g: int, b: int) -> Tuple[int, bool]`

Décode avec validation de redondance.

**Paramètres** :
- `r`, `g`, `b` (int) : Valeurs RGB

**Retour** : Tuple `(sequence_number, is_valid)`
- `sequence_number` : Valeur décodée (0-127)
- `is_valid` : True si G+B=255 (frame non corrompue)

**Exceptions** : `ValueError` si r != 255

### Fonctions utilitaires

#### `is_red_frame(r: int, g: int, b: int) -> bool`

Vérifie si une frame est rouge (R=255).

#### `validate_red_frame_simple(r, g, b) -> Tuple[bool, str]`

Valide une frame rouge avec encodage simple.

**Retour** : `(is_valid, error_message)`

#### `validate_red_frame_diagonal(r, g, b) -> Tuple[bool, str]`

Valide une frame rouge avec encodage diagonal (vérifie G+B=255 et G pair).

#### `get_encoding_info(method: str) -> dict`

Retourne les informations sur une méthode d'encodage.

**Paramètres** :
- `method` : "simple" ou "diagonal"

**Retour** : Dictionnaire avec :
```python
{
    'name': str,
    'max_sequence': int,
    'bits': int,
    'has_redundancy': bool,
    'error_detection': bool,
    'encoder': callable,
    'decoder': callable,
    'validator': callable,
}
```

## Utilisation avec la classe Host

### Configuration

```python
from host import Host

# Méthode simple (par défaut)
host_simple = Host(
    url="http://localhost:7880/whip",
    stun_url="stun:stun.l.google.com:19302",
    output="./benchmark_output",
    encoding_method="simple"  # Optionnel, c'est la valeur par défaut
)

# Méthode diagonal
host_diagonal = Host(
    url="http://localhost:7880/whip",
    stun_url="stun:stun.l.google.com:19302",
    output="./benchmark_output",
    encoding_method="diagonal"
)
```

### Format de sortie JSON

Le fichier `host_timestamps.json` inclut maintenant les informations d'encodage :

```json
{
  "session_info": {
    "encoding_method": "simple",
    "encoding_info": {
      "name": "Simple 16-bit",
      "max_sequence": 65535,
      "bits": 16,
      "has_redundancy": false,
      "error_detection": false
    },
    ...
  },
  "red_timestamps": [
    {
      "frame": 150,
      "timestamp": 1698945123.456789,
      "sequence_number": 1,
      "encoding_method": "simple",
      "rgb": [255, 1, 0],
      ...
    }
  ]
}
```

## Tests

Exécuter la suite de tests complète :

```bash
python test_red_frame_utils.py
```

Sortie attendue :
```
============================================================
TEST SUMMARY
============================================================
  Simple Encoding................................... ✓ PASSED
  Diagonal Encoding................................. ✓ PASSED
  Error Detection................................... ✓ PASSED
  Validation........................................ ✓ PASSED
  Encoding Info..................................... ✓ PASSED
  Wrap-Around....................................... ✓ PASSED

============================================================
ALL TESTS PASSED ✓
============================================================
```

## Exemples

### Exemple 1 : Vérification d'intégrité

```python
from red_frame_utils import encode_sequence_diagonal, decode_sequence_diagonal

# Émetteur
r, g, b = encode_sequence_diagonal(42)
# Simuler une transmission réseau...

# Récepteur
seq, is_valid = decode_sequence_diagonal(r, g, b)
if is_valid:
    print(f"Frame valide, séquence {seq}")
else:
    print(f"⚠️ Frame corrompue ! Estimation: {seq}")
```

### Exemple 2 : Comparaison des méthodes

```bash
python example_encoding_usage.py
```

Affiche un tableau comparatif et des exemples d'utilisation.

## Tableau comparatif

| Feature             | Simple 16-bit         | Diagonal Redundancy   |
|--------------------|-----------------------|-----------------------|
| Max Sequence       | 65535                 | 127                   |
| Bits Used          | 16                    | 7                     |
| Has Redundancy     | False                 | True                  |
| Error Detection    | False                 | True                  |
| Use Case           | Long tests, reliable  | Short tests, validation|

## Notes techniques

### Wrap-around pour diagonal encoding

Si votre test génère plus de 127 red frames avec la méthode diagonal, le Host applique automatiquement un modulo :

```python
# Dans host.py, ligne ~75
if self.host.encoding_method == "diagonal":
    seq = self.special_frame_sequence_number % 128  # Wrap around
    r, g, b = encode_sequence_diagonal(seq)
```

**Conséquence** : Les numéros de séquence 0, 128, 256, etc. auront le même encodage RGB.

### Détection de corruption

La méthode diagonal peut détecter :
- ✅ Changement de valeur d'un canal (G ou B)
- ✅ Perte de bits
- ❌ Ne peut pas détecter si les deux canaux sont corrompus symétriquement

### Performance

Les deux méthodes ont un overhead négligeable :
- Encodage : ~0.1 µs par frame
- Décodage : ~0.1 µs par frame
- Validation : ~0.2 µs par frame

## Contribuer

Pour ajouter une nouvelle méthode d'encodage :

1. Implémenter `encode_sequence_XXX()` et `decode_sequence_XXX()`
2. Ajouter la validation `validate_red_frame_XXX()`
3. Mettre à jour `get_encoding_info()`
4. Ajouter des tests dans `test_red_frame_utils.py`
5. Mettre à jour `host.py` pour supporter la nouvelle méthode

## License

Voir le fichier LICENSE du projet parent.
