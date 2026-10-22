//! Build-only dependency smoke checks. No application backup implementation.

#[cfg(test)]
mod tests {
    use std::io::{Read, Write};

    #[test]
    fn pinned_age_supports_passphrase_streams_and_rejects_corruption() {
        let passphrase =
            age::secrecy::SecretString::from("synthetic bootstrap fixture only".to_owned());
        let encryptor = age::Encryptor::with_user_passphrase(passphrase.clone());
        let mut encrypted = Vec::new();
        let mut writer = encryptor.wrap_output(&mut encrypted).unwrap();
        writer.write_all(b"public build fixture").unwrap();
        writer.finish().unwrap();
        assert!(encrypted.starts_with(b"age-encryption.org/v1\n"));
        let decryptor = age::Decryptor::new(encrypted.as_slice()).unwrap();
        let identity = age::scrypt::Identity::new(passphrase.clone());
        let mut reader = decryptor
            .decrypt(std::iter::once(&identity as &dyn age::Identity))
            .unwrap();
        let mut plain = Vec::new();
        reader.read_to_end(&mut plain).unwrap();
        assert_eq!(plain, b"public build fixture");

        *encrypted.last_mut().unwrap() ^= 1;
        let decryptor = age::Decryptor::new(encrypted.as_slice()).unwrap();
        let mut reader = decryptor
            .decrypt(std::iter::once(&identity as &dyn age::Identity))
            .unwrap();
        assert!(reader.read_to_end(&mut Vec::new()).is_err());
    }

    #[test]
    fn decrypts_public_fixture_from_reference_go_age_1_2_1() {
        let encrypted = include_bytes!("../fixtures/reference-age.age");
        let decryptor = age::Decryptor::new(encrypted.as_slice()).unwrap();
        let identity = age::scrypt::Identity::new(age::secrecy::SecretString::from(
            "synthetic bootstrap fixture only".to_owned(),
        ));
        let mut reader = decryptor
            .decrypt(std::iter::once(&identity as &dyn age::Identity))
            .unwrap();
        let mut plain = Vec::new();
        reader.read_to_end(&mut plain).unwrap();
        assert_eq!(plain, b"public build fixture");
    }
}
