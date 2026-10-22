//! Build-only interoperability fixture producer; no user data or credentials.
use std::io::Write;

fn main() {
    let output = std::env::args().nth(1).expect("output fixture path");
    let passphrase =
        age::secrecy::SecretString::from("synthetic bootstrap fixture only".to_owned());
    let encryptor = age::Encryptor::with_user_passphrase(passphrase);
    let file = std::fs::File::create(output).unwrap();
    let mut writer = encryptor.wrap_output(file).unwrap();
    writer.write_all(b"public build fixture").unwrap();
    writer.finish().unwrap();
}
