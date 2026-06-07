/*
* SEED
* (C) 1999-2007 Jack Lloyd
*
* Botan is released under the Simplified BSD License (see license.txt)
*/

#ifndef BOTAN_SEED_H_
#define BOTAN_SEED_H_

#include <botan/block_cipher.h>
#include <botan/secmem.h>

namespace Botan {

/**
* SEED, a Korean block cipher
*/
class SEED final : public Block_Cipher_Fixed_Params<16, 16> {
   public:
      void encrypt_n(const uint8_t in[], uint8_t out[], size_t blocks) const override;
      void decrypt_n(const uint8_t in[], uint8_t out[], size_t blocks) const override;

      void clear() override;

      std::string name() const override { return "SEED"; }

      std::unique_ptr<BlockCipher> new_object() const override { return std::make_unique<SEED>(); }

      std::string provider() const override;
      size_t parallelism() const override;
      bool has_keying_material() const override;

   private:
      void key_schedule(std::span<const uint8_t> key) override;

#if defined(BOTAN_HAS_SEED_AVX512_GFNI)
      void avx512_gfni_encrypt(const uint8_t in[], uint8_t out[], size_t blocks) const;
      void avx512_gfni_decrypt(const uint8_t in[], uint8_t out[], size_t blocks) const;
#endif

#if defined(BOTAN_HAS_SEED_HWAES)
      void hwaes_encrypt(const uint8_t in[], uint8_t out[], size_t blocks) const;
      void hwaes_decrypt(const uint8_t in[], uint8_t out[], size_t blocks) const;
#endif

      secure_vector<uint32_t> m_K;
};

}  // namespace Botan

#endif
