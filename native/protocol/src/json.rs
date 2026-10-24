use serde::Deserializer;
use serde::de::{self, DeserializeSeed, MapAccess, SeqAccess, Visitor};
use serde_json::{Map, Number, Value};
use std::fmt;

struct Json {
    depth: usize,
}
impl<'de> DeserializeSeed<'de> for Json {
    type Value = Value;
    fn deserialize<D: Deserializer<'de>>(self, d: D) -> Result<Value, D::Error> {
        d.deserialize_any(self)
    }
}
impl<'de> Visitor<'de> for Json {
    type Value = Value;
    fn expecting(&self, f: &mut fmt::Formatter) -> fmt::Result {
        f.write_str("unambiguous JSON")
    }
    fn visit_unit<E: de::Error>(self) -> Result<Value, E> {
        Ok(Value::Null)
    }
    fn visit_bool<E: de::Error>(self, v: bool) -> Result<Value, E> {
        Ok(Value::Bool(v))
    }
    fn visit_str<E: de::Error>(self, v: &str) -> Result<Value, E> {
        Ok(Value::String(v.into()))
    }
    fn visit_string<E: de::Error>(self, v: String) -> Result<Value, E> {
        Ok(Value::String(v))
    }
    fn visit_i64<E: de::Error>(self, v: i64) -> Result<Value, E> {
        Ok(v.into())
    }
    fn visit_u64<E: de::Error>(self, v: u64) -> Result<Value, E> {
        Ok(v.into())
    }
    fn visit_f64<E: de::Error>(self, v: f64) -> Result<Value, E> {
        Number::from_f64(v)
            .map(Value::Number)
            .ok_or_else(|| E::custom("nonfinite number"))
    }
    fn visit_seq<A: SeqAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        if self.depth >= crate::MAX_JSON_DEPTH {
            return Err(de::Error::custom("nesting limit"));
        }
        let mut values = Vec::new();
        while let Some(value) = a.next_element_seed(Json {
            depth: self.depth + 1,
        })? {
            values.push(value);
        }
        Ok(Value::Array(values))
    }
    fn visit_map<A: MapAccess<'de>>(self, mut a: A) -> Result<Value, A::Error> {
        if self.depth >= crate::MAX_JSON_DEPTH {
            return Err(de::Error::custom("nesting limit"));
        }
        let mut values = Map::new();
        while let Some(key) = a.next_key::<String>()? {
            if values.contains_key(&key) {
                return Err(de::Error::custom("duplicate field"));
            }
            values.insert(
                key,
                a.next_value_seed(Json {
                    depth: self.depth + 1,
                })?,
            );
        }
        Ok(Value::Object(values))
    }
}
pub fn parse(bytes: &[u8]) -> Result<Value, serde_json::Error> {
    let mut decoder = serde_json::Deserializer::from_slice(bytes);
    let value = Json { depth: 0 }.deserialize(&mut decoder)?;
    decoder.end()?;
    Ok(value)
}
