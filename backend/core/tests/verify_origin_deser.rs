
#[cfg(test)]
mod tests {
    use cad_core::topo::EntityId;
    use serde_json;

    #[test]
    fn test_deserialize_origin() {
        let json = "\"ORIGIN\"";
        let result: Result<EntityId, _> = serde_json::from_str(json);
        match result {
            Ok(id) => println!("Success: {:?}", id),
            Err(e) => println!("Error: {:?}", e),
        }
    }
}
