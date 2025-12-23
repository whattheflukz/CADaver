use super::EntityId;
use uuid::Uuid;
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;

/// A deterministic ID generator that produces a sequence of EntityIds 
/// based on a seed namespace and a counter.
#[derive(Debug, Clone)]
pub struct IdGenerator {
    namespace: Uuid,
    counter: Arc<AtomicUsize>,
}

impl IdGenerator {
    /// Create a new generator from a string seed.
    /// This seed should be unique to the context (e.g. "Sketch1", "Extrude2").
    pub fn new(seed: &str) -> Self {
        let namespace = Uuid::new_v5(&Uuid::NAMESPACE_OID, seed.as_bytes());
        Self {
            namespace,
            counter: Arc::new(AtomicUsize::new(0)),
        }
    }

    /// Generate the next deterministic ID in the sequence.
    pub fn next_id(&self) -> EntityId {
        let count = self.counter.fetch_add(1, Ordering::SeqCst);
        let count_bytes = count.to_be_bytes();
        // Generate a v5 UUID using the namespace and the counter as the name
        let uuid = Uuid::new_v5(&self.namespace, &count_bytes);
        EntityId::from_uuid(uuid)
    }

    /// Create a child generator derived from this one.
    /// Useful for hierarchical generation (e.g. features inside a container).
    pub fn fork(&self, discriminator: &str) -> IdGenerator {
        // We use the next ID from the current generator as the seed context for the child
        // combined with the discriminator.
        let base_id = self.next_id(); 
        let combined_seed = format!("{}:{}", base_id, discriminator);
        Self::new(&combined_seed)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_deterministic_sequence() {
        let gen1 = IdGenerator::new("TestScope");
        let gen2 = IdGenerator::new("TestScope");

        let id1_a = gen1.next_id();
        let id1_b = gen1.next_id();

        let id2_a = gen2.next_id();
        let id2_b = gen2.next_id();

        assert_eq!(id1_a, id2_a, "IDs should match for same seed and sequence");
        assert_eq!(id1_b, id2_b, "IDs should match for same seed and sequence");
        assert_ne!(id1_a, id1_b, "IDs in sequence should be different");
    }

    #[test]
    fn test_different_seeds() {
        let gen1 = IdGenerator::new("ScopeA");
        let gen2 = IdGenerator::new("ScopeB");

        assert_ne!(gen1.next_id(), gen2.next_id());
    }

    #[test]
    fn test_forking() {
        let parent = IdGenerator::new("Root");
        let child1 = parent.fork("Child1");
        let child2 = parent.fork("Child1"); // Should be different because parent's counter moved

        // Wait, if I fork "Child1" twice from the SAME parent instance, 
        // the parent's counter increments when `next_id()` is called inside `fork`.
        // So `child1` and `child2` get different namespaces.
        
        let id1 = child1.next_id();
        let id2 = child2.next_id();
        
        assert_ne!(id1, id2);
    }
    
    #[test]
    fn test_forking_reproducibility() {
        // To reproduce the same child, we need the same parent state
        let parent1 = IdGenerator::new("Root");
        let child1 = parent1.fork("ChildA");
        
        let parent2 = IdGenerator::new("Root");
        let child2 = parent2.fork("ChildA");
        
        assert_eq!(child1.next_id(), child2.next_id());
    }
}
