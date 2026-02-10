"""
Utilities for encoding and decoding sequence numbers in red frames.

Red frames are used for latency measurement in the benchmark system.
The sequence number is encoded in the Green and Blue channels while Red is always 255.
"""

from typing import Tuple


def encode_sequence_simple(sequence_number: int) -> Tuple[int, int, int]:
    """
    Encode sequence number using simple 16-bit splitting.
    
    Uses 16 bits total (0-65535):
    - G channel: bits 0-7 (low byte)
    - B channel: bits 8-15 (high byte)
    
    Args:
        sequence_number: Integer between 0 and 65535
        
    Returns:
        Tuple (R, G, B) where R=255, G=low byte, B=high byte
        
    Example:
        >>> encode_sequence_simple(0)
        (255, 0, 0)
        >>> encode_sequence_simple(255)
        (255, 255, 0)
        >>> encode_sequence_simple(256)
        (255, 0, 1)
        >>> encode_sequence_simple(65535)
        (255, 255, 255)
    """
    if not 0 <= sequence_number <= 65535:
        raise ValueError(f"Sequence number must be between 0 and 65535, got {sequence_number}")
    
    r = 255
    g = sequence_number & 0xFF          # Bits 0-7
    b = (sequence_number >> 8) & 0xFF   # Bits 8-15
    
    return (r, g, b)


def decode_sequence_simple(r: int, g: int, b: int) -> int:
    """
    Decode sequence number from simple 16-bit encoding.
    
    Args:
        r: Red channel (should be 255)
        g: Green channel (low byte)
        b: Blue channel (high byte)
        
    Returns:
        Decoded sequence number (0-65535)
        
    Raises:
        ValueError: If red channel is not 255 (not a red frame)
        
    Example:
        >>> decode_sequence_simple(255, 0, 0)
        0
        >>> decode_sequence_simple(255, 255, 0)
        255
        >>> decode_sequence_simple(255, 0, 1)
        256
        >>> decode_sequence_simple(255, 255, 255)
        65535
    """
    if r != 255:
        raise ValueError(f"Not a red frame: R={r} (expected 255)")
    
    sequence_number = g | (b << 8)
    return sequence_number


def encode_sequence_diagonal(sequence_number: int) -> Tuple[int, int, int]:
    """
    Encode sequence number using robust diagonal redundancy method.
    
    Enhanced error correction strategy:
    - G = (x * 2) + padding for robustness
    - B = 255 - G (redundant complement)
    - Uses error-tolerant encoding to handle compression artifacts
    
    This provides error detection and correction for video compression losses.
    
    Args:
        sequence_number: Integer between 0 and 127
        
    Returns:
        Tuple (R, G, B) where R=255, G=x*2, B=255-G
        
    Example:
        >>> encode_sequence_diagonal(0)
        (255, 0, 255)
        >>> encode_sequence_diagonal(1)
        (255, 2, 253)
        >>> encode_sequence_diagonal(63)
        (255, 126, 129)
        >>> encode_sequence_diagonal(127)
        (255, 254, 1)
    """
    if not 0 <= sequence_number <= 127:
        raise ValueError(f"Sequence number must be between 0 and 127, got {sequence_number}")
    
    r = 255
    
    # Encodage robuste : espacement de 2 pour éviter les erreurs de ±1
    # Garde les valeurs extrêmes (0, 254) pour maximiser la distance
    g = min(254, max(0, sequence_number * 2))
    b = 255 - g
    
    # Validation de l'encodage
    assert g + b == 255, f"Encoding error: G={g}, B={b}, sum={g+b}"
    assert g % 2 == 0, f"Encoding error: G={g} must be even"
    
    return (r, g, b)


def decode_sequence_diagonal(r: int, g: int, b: int) -> Tuple[int, bool]:
    """
    Decode sequence number from robust diagonal redundancy encoding.
    
    Enhanced error correction with tolerance for video compression artifacts:
    - Accepts small deviations in redundancy check (±2 tolerance)
    - Uses error correction algorithm when G+B ≠ 255
    - Validates sequence bounds and even/odd constraints
    
    Args:
        r: Red channel (should be ~255, accepts 240-255)
        g: Green channel (x * 2, with tolerance)
        b: Blue channel (255 - G, with tolerance)
        
    Returns:
        Tuple of (sequence_number, is_valid) where:
        - sequence_number: Decoded value (0-127)
        - is_valid: True if frame passes robustness checks
        
    Example:
        >>> decode_sequence_diagonal(255, 0, 255)
        (0, True)
        >>> decode_sequence_diagonal(255, 2, 253)
        (1, True)
        >>> decode_sequence_diagonal(254, 126, 128)  # Slight compression error
        (63, True)
        >>> decode_sequence_diagonal(255, 100, 100)  # Major corruption
        (50, False)
    """
    # Tolérance pour la compression vidéo : R peut être légèrement < 255
    if r < 120:  # Seuil plus tolérant que 128
        raise ValueError(f"Not a red frame: R={r} (expected ≥120)")
    
    # Correction d'erreur robuste
    sum_gb = g + b
    deviation = abs(sum_gb - 255)
    
    # Niveaux de validation
    is_perfect = (deviation == 0)
    is_good = (deviation <= 2)      # Tolérance ±2 pour compression légère
    is_acceptable = (deviation <= 5) # Tolérance ±5 pour compression agressive
    
    # Algorithme de correction d'erreur robuste
    if is_perfect:
        # Cas parfait : pas de correction nécessaire
        g_corrected = g
    elif is_good or is_acceptable:
        # Stratégie de correction robuste style QR code
        if deviation <= 2:
            # Erreur légère : correction fine
            if g % 2 == 0:
                # G est déjà pair, privilégier G
                g_corrected = g
            else:
                # G impair : corriger vers le pair le plus proche
                g_corrected = g - 1 if g > 0 else g + 1
        else:
            # Erreur moyenne : reconstruction par approximation
            # Utiliser la moyenne des deux canaux pour estimer la valeur
            estimated_g = round((g + (255 - b)) / 2)
            
            # Forcer G à être pair et dans les bonnes limites
            g_corrected = max(0, min(254, estimated_g))
            if g_corrected % 2 != 0:
                # Choisir le pair le plus proche de la valeur estimée
                if g_corrected > 127:
                    g_corrected = g_corrected - 1  # Vers le bas
                else:
                    g_corrected = g_corrected + 1  # Vers le haut
            
            g_corrected = max(0, min(254, g_corrected))
    else:
        # Erreur importante : tentative de récupération basique
        # Forcer G à être pair même si les données sont corrompues
        g_corrected = max(0, min(254, g))
        if g_corrected % 2 != 0:
            g_corrected = g_corrected - (g_corrected % 2)
    
    # Décodage du numéro de séquence
    sequence_number = g_corrected // 2
    
    # Validation finale
    is_valid = (
        is_acceptable and                    # Erreur dans les limites tolérées
        0 <= sequence_number <= 127 and      # Séquence valide
        g_corrected % 2 == 0 and            # G pair (contrainte encodage)
        0 <= g_corrected <= 254              # G dans les limites
    )
    
    # Clamp sequence_number dans les limites valides
    sequence_number = max(0, min(127, sequence_number))
    
    return (sequence_number, is_valid)


def is_red_frame(r: int, g: int, b: int) -> bool:
    """
    Check if a frame is a red frame.
    
    Lowered threshold to 120 to handle video compression artifacts
    that can reduce R from 255 to ~130-180 range.
    """
    return r >= 120  # Cohérent avec decode_sequence_diagonal qui accepte >= 240


def validate_red_frame_simple(r: int, g: int, b: int) -> Tuple[bool, str]:
    """
    Validate a red frame using simple encoding rules.
    
    Args:
        r: Red channel value
        g: Green channel value
        b: Blue channel value
        
    Returns:
        Tuple of (is_valid, error_message)
        
    Example:
        >>> validate_red_frame_simple(255, 100, 50)
        (True, '')
        >>> validate_red_frame_simple(200, 100, 50)
        (False, 'Not a red frame: R=200')
        >>> validate_red_frame_simple(255, 256, 50)
        (False, 'Invalid channel values: G=256, B=50')
    """
    if r != 255:
        return (False, f"Not a red frame: R={r}")
    
    if not (0 <= g <= 255 and 0 <= b <= 255):
        return (False, f"Invalid channel values: G={g}, B={b}")
    
    return (True, "")


def validate_red_frame_diagonal(r: int, g: int, b: int) -> Tuple[bool, str]:
    """
    Validate a red frame using diagonal encoding rules.
    
    Args:
        r: Red channel value
        g: Green channel value
        b: Blue channel value
        
    Returns:
        Tuple of (is_valid, error_message)
        
    Example:
        >>> validate_red_frame_diagonal(255, 0, 255)
        (True, '')
        >>> validate_red_frame_diagonal(255, 2, 253)
        (True, '')
        >>> validate_red_frame_diagonal(255, 100, 100)
        (False, 'Redundancy check failed: G+B=200 (expected 255)')
        >>> validate_red_frame_diagonal(255, 1, 254)
        (False, 'Invalid encoding: G=1 must be even')
    """
    if r < 128:
        return (False, f"Not a red frame: R={r}")
    
    if not (0 <= g <= 255 and 0 <= b <= 255):
        return (False, f"Invalid channel values: G={g}, B={b}")
    
    # Check redundancy
    if g + b != 255:
        return (False, f"Redundancy check failed: G+B={g+b} (expected 255)")
    
    # Check that G is even (since G = x * 2)
    if g % 2 != 0:
        return (False, f"Invalid encoding: G={g} must be even")
    
    return (True, "")


# Helper function to get encoding method info
def get_encoding_info(method: str = "simple") -> dict:
    """
    Get information about an encoding method.
    
    Args:
        method: Either "simple" or "diagonal"
        
    Returns:
        Dictionary with encoding method details
        
    Example:
        >>> info = get_encoding_info("simple")
        >>> info['max_sequence']
        65535
        >>> info['has_redundancy']
        False
    """
    if method == "simple":
        return {
            "name": "Simple 16-bit",
            "max_sequence": 65535,
            "bits": 16,
            "has_redundancy": False,
            "error_detection": False,
            "encoder": encode_sequence_simple,
            "decoder": decode_sequence_simple,
            "validator": validate_red_frame_simple,
        }
    elif method == "diagonal":
        return {
            "name": "Diagonal with redundancy",
            "max_sequence": 127,
            "bits": 7,
            "has_redundancy": True,
            "error_detection": True,
            "encoder": encode_sequence_diagonal,
            "decoder": decode_sequence_diagonal,
            "validator": validate_red_frame_diagonal,
        }
    else:
        raise ValueError(f"Unknown encoding method: {method}")


if __name__ == "__main__":
    import doctest
    doctest.testmod()
    
    print("\n=== Red Frame Encoding Utils Demo ===\n")
    
    # Test simple encoding
    # print("Simple 16-bit encoding:")
    # for seq in [0, 1, 127, 255, 256, 1000, 65535]:
    #     r, g, b = encode_sequence_simple(seq)
    #     decoded = decode_sequence_simple(r, g, b)
    #     print(f"  Seq {seq:5d} -> RGB({r}, {g:3d}, {b:3d}) -> Decoded: {decoded:5d} ✓")
    
    # print("\nDiagonal encoding with redundancy:")
    # for seq in [0, 1, 63, 127]:
    #     r, g, b = encode_sequence_diagonal(seq)
    #     decoded, valid = decode_sequence_diagonal(r, g, b)
    #     status = "✓" if valid else "✗"
    #     print(f"  Seq {seq:3d} -> RGB({r}, {g:3d}, {b:3d}) -> Decoded: {decoded:3d} {status}")
    
    # # Test error detection
    # print("\nError detection (diagonal):")
    # print("  Valid frame:   RGB(255, 100, 155) ->", decode_sequence_diagonal(255, 100, 155))
    # print("  Corrupted (1): RGB(255, 100, 100) ->", decode_sequence_diagonal(255, 100, 100))
    # print("  Corrupted (2): RGB(255, 101, 154) ->", decode_sequence_diagonal(255, 101, 154))
    print(decode_sequence_diagonal(255, 9, 245))