-- Allow players to select multiple values per targeting attribute.
-- Drops the one-value-per-attribute constraint and replaces it with a
-- one-row-per-(user, value) constraint so a player can tag themselves
-- as e.g. both "Teen" and "Senior" within the same dimension.

ALTER TABLE user_targeting_values
  DROP CONSTRAINT user_targeting_values_user_id_attribute_id_key;

ALTER TABLE user_targeting_values
  ADD CONSTRAINT user_targeting_values_user_id_value_key
  UNIQUE (user_id, targeting_value_id);
