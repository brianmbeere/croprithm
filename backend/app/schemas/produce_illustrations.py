from enum import Enum

from pydantic import BaseModel


class IllustrationId(str, Enum):
    TOMATO = "tomato"
    CARROT = "carrot"
    GREENS = "greens"
    ONION = "onion"
    POTATO = "potato"
    CORN = "corn"
    PEPPER = "pepper"
    APPLE = "apple"
    STRAWBERRY = "strawberry"
    BROCCOLI = "broccoli"
    CUCUMBER = "cucumber"
    MUSHROOM = "mushroom"
    SEEDLING = "seedling"


class ProduceIllustration(BaseModel):
    id: IllustrationId
    label: str
    symbol: str
    background: str


ILLUSTRATIONS = {
    key.value: ProduceIllustration(id=key, label=label, symbol=symbol, background=background)
    for key, label, symbol, background in [
        (IllustrationId.TOMATO, "Tomato", "🍅", "#f7e7dc"),
        (IllustrationId.CARROT, "Carrot", "🥕", "#f7ead5"),
        (IllustrationId.GREENS, "Leafy greens", "🥬", "#e7eddc"),
        (IllustrationId.ONION, "Onion", "🧅", "#f1e7eb"),
        (IllustrationId.POTATO, "Potato", "🥔", "#f3eadb"),
        (IllustrationId.CORN, "Corn", "🌽", "#f4edd4"),
        (IllustrationId.PEPPER, "Pepper", "🫑", "#e6ecdb"),
        (IllustrationId.APPLE, "Apple", "🍎", "#f7e4df"),
        (IllustrationId.STRAWBERRY, "Strawberry", "🍓", "#f7e5e9"),
        (IllustrationId.BROCCOLI, "Broccoli", "🥦", "#e4ebdf"),
        (IllustrationId.CUCUMBER, "Cucumber", "🥒", "#e4ebdf"),
        (IllustrationId.MUSHROOM, "Mushroom", "🍄", "#f4e7df"),
        (IllustrationId.SEEDLING, "Seedling", "🌱", "#e7eddc"),
    ]
}
